#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const maxFileBytes = 2 * 1024 * 1024
const sourceExtensions = new Set(['.cjs', '.js', '.jsx', '.mjs', '.ts', '.tsx'])
const hostSecurityBoundaryPath = /^src\/(?:main|preload|shared)\//u
const hostCompositionPath = /^src\/renderer\/src\/domain-modules\//u
const meetingLoopArtifactPath = /^(?:docs|infra|openspec)\/.*(?:collaboration|content-space|full-multi-user|identity-access|run0)/iu
const meetingLoopPackageSegment = /(?:^|-)(?:collaboration|content-space|identity-access|opencontent|project-coordinator)(?:-|$)/u
const testPath = /(?:^|\/)(?:__tests__|tests?|test-fixtures)(?:\/|$)|(?:^|\/)(?:test_[^/]+|[^/]+\.(?:test|spec))\.[^/]+$/iu
const ownAuditFixturePath = /(?:^|\/)scripts\/(?:fixtures\/collaboration-secret-audit(?:\/|$)|collaboration-secret-audit\.test\.)/u
const rendererPath = /(?:^|\/)src\/renderer(?:\/|$)/u
const boundaryFilePath = /(?:^|\/)(?:[^/]*(?:contract|protocol|capabilit|ipc)[^/]*)\.(?:[cm]?[jt]sx?|json)$/iu
const receiptFilePath = /(?:^|\/)[^/]*(?:receipt|evidence|acceptance)[^/]*\.(?:[cm]?[jt]sx?|json)$/iu

const safeMetadataSuffixes = [
  'configured',
  'digest',
  'expiresat',
  'expiry',
  'fingerprint',
  'generation',
  'hash',
  'issuedat',
  'locked',
  'present',
  'recordversion',
  'revision',
  'status',
  'version'
]

const nonAuthorizingLocatorNames = new Set([
  'agentcredentialid',
  'credentialid',
  'devicecredentialid',
  'providercredentialid',
  'providersecretreference',
  'provisioningcredentialsecretreference',
  'secretkeyname',
  'secretreference',
  'usercredentialid'
])

const credentialShapeDetectors = [
  ['private-key-material', /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/u],
  ['aws-credential-shaped-value', /(?:AKIA|ASIA)[0-9A-Z]{16}/u],
  ['github-credential-shaped-value', /gh[pousr]_[A-Za-z0-9]{20,}/u],
  ['slack-credential-shaped-value', /xox[baprs]-[A-Za-z0-9-]{10,}/u],
  ['model-credential-shaped-value', /sk-[A-Za-z0-9_-]{20,}/u],
  ['jwt-shaped-value', /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/u],
  ['collaboration-credential-shaped-value', /(?:agent|device|provider|user)\.[A-Za-z0-9_-]{32,}/u]
]

const sensitiveFileName = /(?:^|\/)(?:\.env|id_rsa|id_ed25519|credentials\.json|secrets\.json|tokens?\.json)$|\.(?:key|pem|p12|pfx)$/iu
const logSinkName = /^(?:console\.)?(?:debug|error|info|log|table|trace|warn)$|^process\.(?:stderr|stdout)\.write$|(?:^|\.)(?:audit|logger|telemetry)\.(?:debug|error|info|log|trace|warn)$/iu
const processIoSinkName = /(?:^|\.)(?:stdin|stdout|stderr)\.(?:end|pipe|write)$/u
const receiptSinkName = /(?:^|\.)(?:append|emit|insert|publish|save|store|write|writeFile)[A-Za-z0-9_]*(?:Evidence|Receipt)|(?:^|\.)(?:append|insert|save|store|write)(?:Evidence|Receipt)[A-Za-z0-9_]*$/u
const persistenceSinkName = /(?:^|\.)(?:appendFile|insert|persist|put|save|setItem|store|upsert|write|writeFile)$/u
const securePersistenceName = /(?:credential|keychain|nativeSecret|safeStorage|secret)(?:File|Reader|Service|Store)?\.(?:put|save|set|store|write|writeFile)|(?:^|[.#])secrets\.(?:put|save|set|store|write|writeFile)$/iu
const secretTransformCallName = /(?:^|\.)(?:digest|encrypt|fingerprint|hash|mask|redact|sanitize|scrub|seal)(?:Credential|Secret|Token|Value)?s?$/iu
const nonSecretComparisonOperators = new Set([
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.LessThanToken,
  ts.SyntaxKind.LessThanEqualsToken,
  ts.SyntaxKind.GreaterThanToken,
  ts.SyntaxKind.GreaterThanEqualsToken,
  ts.SyntaxKind.InKeyword,
  ts.SyntaxKind.InstanceOfKeyword
])

function normalizePath(path) {
  return path.split(sep).join('/')
}

function normalizeName(name) {
  return name.replace(/[^A-Za-z0-9]/gu, '').toLowerCase()
}

function isNonAuthorizingMetadata(normalized) {
  return nonAuthorizingLocatorNames.has(normalized) ||
    safeMetadataSuffixes.some((suffix) => normalized.endsWith(suffix))
}

function secretAuthorityName(name) {
  const normalized = normalizeName(name)
  return /(?:credential|secret)(?:reader|resolver|service|store|writer|port)+(?:host)?$/u.test(normalized)
}

function secretAuthorityOperationName(name) {
  return /^(?:read|replace|resolve|use|write)(?:agent|device|identity|oidc|provider|user)?(?:credential|secret|token)(?:material|value)?s?$/u.test(normalizeName(name))
}

function isProcessSink(name) {
  if (/^(?:exec|execFile|execFileSync|execSync|fork|spawn|spawnSync)$/u.test(name)) return true
  return /(?:^|\.)(?:childProcess|subprocess|processRunner)\.(?:exec|execFile|execFileSync|execSync|fork|spawn|spawnSync)$/iu.test(name)
}

function isIpcSink(name, file) {
  if (/(?:^|\.)(?:executeAsUser|postMessage|registerCapability|registerInvocation|sendSync)$/u.test(name)) return true
  if (/(?:ipc|renderer|webContents|messagePort|capabilit|broker|boundary|transport)/iu.test(name) &&
    /(?:^|\.)(?:emit|invoke|publish|send)$/u.test(name)) return true
  return (rendererPath.test(file) || boundaryFilePath.test(file)) &&
    /(?:^|\.)(?:invoke|postMessage|publish|send|sendSync)$/u.test(name)
}

function isSecurePersistenceSink(name, file) {
  const privateOwnerRuntime = /packages\/domains\/(?:identity-access|opencontent-connector)\/src\/main\//u.test(file)
  if (privateOwnerRuntime && securePersistenceName.test(name)) return true
  if (privateOwnerRuntime && /(?:^|\.)sessionStore\.save$/u.test(name)) return true
  return /packages\/(?:collaboration-server|collaboration-provider-[^/]+)\/src\//u.test(file) &&
    /(?:^|\.)(?:provider|server)?SecretFile\.(?:put|save|set|store|write|writeFile)$/iu.test(name)
}

/**
 * Returns the secret category represented by a field or symbol name. Opaque,
 * handle, reference, ref, and id suffixes are not permissions: they remain
 * secret when the value is a bearer. Only explicit non-authorizing metadata
 * and locators are excluded.
 */
function secretCategory(name, options = {}) {
  const normalized = normalizeName(name)
  if (!normalized || normalized.includes('invalidtestonly')) return null
  if (isNonAuthorizingMetadata(normalized)) return null

  const materialName = normalized
    .replace(/^(?:(?:encrypted|masked|redacted|sanitized|scrubbed|sealed))+/u, '')
    .replace(/(?:(?:encrypted|masked|redacted|sanitized|scrubbed|sealed))+$/u, '')
    .replace(/^(?:plain|plaintext|raw)/u, '')
    .replace(/(?:buffer|bytes|material|payload|value)$/u, '')
    .replace(/(?:directory|file|handle|id|opaque|path|reference|ref)$/u, '')
  const wrappedMaterial = materialName !== normalized

  if (/^(?:(?:access|refresh|identity|oidc|bearer|session|user|device|agent|provider|machine|id)?token)$/u.test(materialName)) {
    return 'token'
  }
  if (/^providercredentials?$/u.test(materialName)) return 'provider-credential'
  if (/^(?:user|device|agent|agentmachine|provider|machine)credentials?$/u.test(materialName) ||
    (wrappedMaterial && /^credentials?$/u.test(materialName))) {
    return 'credential'
  }
  if (/^(?:poll|client|provider|shared|signing|encryption|server|identity|user|device|agent)?secrets?$/u.test(materialName)) {
    return 'secret'
  }
  if (/^(?:private|signing|encryption)keys?(?:jwk)?$/u.test(materialName)) {
    return 'private-key'
  }
  if (/^(?:provider)?api(?:keys?)$/u.test(materialName)) return 'provider-credential'
  if (/^(?:password|passphrase|pkceverifier|authorizationcode)$/u.test(materialName)) return 'credential'
  if (/^(?:raw)?(?:bearer)?authorization(?:header|material|value)?$/u.test(normalized) &&
    normalized !== 'authorization') return 'authorization-header'
  if (materialName === 'authorization' && options.headerContext) return 'authorization-header'
  return null
}

function lineOf(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
}

function nodeName(node) {
  if (!node) return ''
  if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node) || ts.isStringLiteralLike(node)) return node.text
  if (ts.isNumericLiteral(node)) return node.text
  if (ts.isComputedPropertyName(node) && ts.isStringLiteralLike(node.expression)) return node.expression.text
  return ''
}

function calleeName(expression, sourceFile) {
  if (ts.isIdentifier(expression) || ts.isPrivateIdentifier(expression)) return expression.text
  if (ts.isPropertyAccessExpression(expression)) {
    const left = calleeName(expression.expression, sourceFile)
    return left ? `${left}.${expression.name.text}` : expression.name.text
  }
  if (ts.isElementAccessExpression(expression) && ts.isStringLiteralLike(expression.argumentExpression)) {
    const left = calleeName(expression.expression, sourceFile)
    return left ? `${left}.${expression.argumentExpression.text}` : expression.argumentExpression.text
  }
  return expression.getText(sourceFile).slice(0, 256)
}

function isSyntheticDeclaration(node) {
  const declarationName = nodeName(node.name)
  return /invalid.*test.*only/iu.test(declarationName)
}

function isProvenNonSecretStructuralReplacement(node) {
  let current = node
  while (ts.isParenthesizedExpression(current) || ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) || ts.isNonNullExpression(current) ||
    ts.isTypeAssertionExpression(current)) current = current.expression

  if (ts.isBinaryExpression(current)) {
    return nonSecretComparisonOperators.has(current.operatorToken.kind)
  }
  if (ts.isTypeOfExpression(current) || ts.isVoidExpression(current)) return true
  if (ts.isPrefixUnaryExpression(current) && current.operator === ts.SyntaxKind.ExclamationToken) return true
  return ts.isPropertyAccessExpression(current) && current.name.text === 'length'
}

function containsSensitiveExpression(node, sourceFile, taintedNames = new Map()) {
  let match = null
  function visit(current) {
    if (match) return
    if (isProvenNonSecretStructuralReplacement(current)) return
    if (ts.isIdentifier(current) || ts.isPrivateIdentifier(current)) {
      const category = secretCategory(current.text)
      if (category) match = { node: current, category }
      else if (taintedNames.has(current.text)) match = { node: current, category: taintedNames.get(current.text) }
      return
    }
    if (ts.isPropertyAccessExpression(current)) {
      const category = secretCategory(current.name.text)
      if (category) {
        match = { node: current.name, category }
        return
      }
    }
    if (ts.isPropertyAssignment(current) || ts.isShorthandPropertyAssignment(current)) {
      const category = secretCategory(nodeName(current.name), {
        headerContext: isAuthorizationHeaderProperty(current, sourceFile)
      })
      if (category) {
        match = { node: current.name, category }
        return
      }
    }
    ts.forEachChild(current, visit)
  }
  visit(node)
  return match
}

function collectBindingIdentifiers(name, result = []) {
  if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name)) {
    result.push(name)
    return result
  }
  if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
    for (const element of name.elements) {
      if (ts.isBindingElement(element)) collectBindingIdentifiers(element.name, result)
    }
  }
  return result
}

function unwrapAliasExpression(node) {
  let current = node
  while (ts.isAwaitExpression(current) || ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) || ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current) || ts.isTypeAssertionExpression(current)) {
    current = current.expression
  }
  return current
}

function isMaterialPreservingCall(node, sourceFile) {
  const name = calleeName(node.expression, sourceFile)
  if (/^(?:Buffer\.from|JSON\.stringify|Object\.freeze|Promise\.resolve|String)$/u.test(name)) return true
  const expression = node.getText(sourceFile).slice(0, 512)
  return /\bz\.(?:array|discriminatedUnion|object|record|tuple|union)\s*\(/u.test(expression)
}

function aliasInitializerSecret(node, sourceFile, taintedNames) {
  const expression = unwrapAliasExpression(node)
  if (isProvenNonSecretStructuralReplacement(expression)) return null
  if (ts.isCallExpression(expression)) {
    const name = calleeName(expression.expression, sourceFile)
    if (!secretTransformCallName.test(name) && !isMaterialPreservingCall(expression, sourceFile)) return null
  } else if (ts.isNewExpression(expression)) {
    const constructorName = expression.expression.getText(sourceFile)
    if (!/^(?:Buffer|DataView|TextEncoder|Uint8Array)$/u.test(constructorName)) return null
  }
  return containsSensitiveExpression(expression, sourceFile, taintedNames)
}

function collectSecretTaints(scopeNode, sourceFile) {
  const taintedNames = new Map()
  const mark = (identifier, category) => {
    if (!identifier?.text || taintedNames.has(identifier.text)) return false
    taintedNames.set(identifier.text, category)
    return true
  }
  const markBinding = (name, category) => {
    let changed = false
    for (const identifier of collectBindingIdentifiers(name)) {
      changed = mark(identifier, category) || changed
    }
    return changed
  }

  for (let pass = 0; pass < 8; pass += 1) {
    let changed = false
    function visit(node) {
      if (node !== scopeNode && (ts.isFunctionLike(node) || ts.isSourceFile(node))) return
      if (ts.isVariableDeclaration(node)) {
        const initializerSecret = node.initializer
          ? aliasInitializerSecret(node.initializer, sourceFile, taintedNames)
          : null
        if (initializerSecret) changed = markBinding(node.name, initializerSecret.category) || changed
        if (ts.isObjectBindingPattern(node.name)) {
          for (const element of node.name.elements) {
            if (!ts.isBindingElement(element)) continue
            const sourceName = nodeName(element.propertyName ?? element.name)
            const category = secretCategory(sourceName)
            if (category) changed = markBinding(element.name, category) || changed
          }
        }
      } else if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        const source = aliasInitializerSecret(node.right, sourceFile, taintedNames)
        if (source && (ts.isIdentifier(node.left) || ts.isArrayLiteralExpression(node.left) ||
          ts.isObjectLiteralExpression(node.left))) {
          if (ts.isIdentifier(node.left)) changed = mark(node.left, source.category) || changed
          else {
            for (const child of node.left.elements) {
              if (ts.isIdentifier(child)) changed = mark(child, source.category) || changed
              if (ts.isPropertyAssignment(child)) {
                for (const identifier of collectBindingIdentifiers(child.initializer)) {
                  changed = mark(identifier, source.category) || changed
                }
              }
            }
          }
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(scopeNode)
    if (!changed) break
  }
  return taintedNames
}

function nearestTaintScope(node) {
  let current = node
  while (current && !ts.isSourceFile(current) && !ts.isFunctionLike(current)) current = current.parent
  return current
}

function createTaintResolver(sourceFile) {
  const cache = new Map()
  return (node) => {
    const scopes = []
    let current = nearestTaintScope(node)
    while (current) {
      scopes.push(current)
      if (ts.isSourceFile(current)) break
      current = nearestTaintScope(current.parent)
    }
    const result = new Map()
    for (const scope of scopes.reverse()) {
      let taints = cache.get(scope)
      if (!taints) {
        taints = collectSecretTaints(scope, sourceFile)
        cache.set(scope, taints)
      }
      for (const [name, category] of taints) result.set(name, category)
    }
    return result
  }
}

function containsEnvironmentSource(node, sourceFile) {
  let match = null
  function visit(current, parent = null) {
    if (match) return
    if (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
      const expression = current.getText(sourceFile)
      const environmentAccess = /^(?:Deno|process)\.env(?:\.|\[|$)|^import\.meta\.env(?:\.|\[|$)/u.test(expression)
      const terminalName = ts.isPropertyAccessExpression(current)
        ? current.name.text
        : (ts.isStringLiteralLike(current.argumentExpression) ? current.argumentExpression.text : '')
      const directEnvironment = /^(?:Deno|process)\.env$|^import\.meta\.env$/u.test(expression)
      if (environmentAccess && (environmentSecretCategory(terminalName) ||
        (directEnvironment && (!parent ||
          (!ts.isPropertyAccessExpression(parent) && !ts.isElementAccessExpression(parent)))))) {
        match = current
        return
      }
    }
    ts.forEachChild(current, (child) => visit(child, current))
  }
  visit(node)
  return match
}

function environmentSecretCategory(name) {
  if (/(?:^|_)(?:ACCESS|REFRESH|ID|OIDC|BEARER|SESSION|USER|DEVICE|AGENT|PROVIDER)?_?TOKEN(?:$|_)/iu.test(name)) {
    return 'token'
  }
  if (/(?:^|_)(?:API_?KEY|CREDENTIAL|PASSWORD|PASSPHRASE|PRIVATE_?KEY|SECRET)(?:$|_)/iu.test(name)) {
    return 'environment'
  }
  return null
}

function isAuthorizationHeaderProperty(node, sourceFile) {
  if (nodeName(node.name).toLowerCase() !== 'authorization') return false
  const initializer = node.initializer
  if (initializer && (ts.isStringLiteralLike(initializer) || ts.isNoSubstitutionTemplateLiteral(initializer) ||
    ts.isTemplateExpression(initializer))) return true
  const stringTyped = node.type?.kind === ts.SyntaxKind.StringKeyword ||
    (node.type && ts.isUnionTypeNode(node.type) &&
      node.type.types.some((member) => member.kind === ts.SyntaxKind.StringKeyword))
  let current = node.parent
  let context = ''
  for (let depth = 0; current && depth < 4; depth += 1, current = current.parent) {
    context += ` ${nodeName(current.name)} ${current.kind === ts.SyntaxKind.TypeLiteral ? '' : current.getText(sourceFile).slice(0, 128)}`
  }
  return Boolean(stringTyped || (initializer && isStringSchema(initializer))) &&
    /header|http|request|transport/iu.test(context)
}

function isStringSchema(node) {
  if (!ts.isCallExpression(node)) return false
  if (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'string') return true
  if (ts.isPropertyAccessExpression(node.expression)) return isStringSchema(node.expression.expression)
  return false
}

function isEncryptedEnvelopeFieldSet(fields) {
  return fields.has('algorithm') && fields.has('ciphertext') &&
    (fields.has('iv') || fields.has('nonce')) &&
    (fields.has('authenticationtag') || fields.has('authtag') || fields.has('tag'))
}

function provesEncryptedEnvelope(file, node, resolveReference, visited = new Set()) {
  if (!node) return false
  const key = `${file}:${node.pos}:${node.end}`
  if (visited.has(key)) return false
  visited.add(key)

  if (ts.isParenthesizedTypeNode(node) || ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) || ts.isSatisfiesExpression(node) ||
    ts.isNonNullExpression(node) || ts.isTypeAssertionExpression(node)) {
    return provesEncryptedEnvelope(file, node.type ?? node.expression, resolveReference, visited)
  }
  if (ts.isPropertySignature(node) || ts.isPropertyDeclaration(node) || ts.isPropertyAssignment(node) ||
    ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isTypeAliasDeclaration(node)) {
    return provesEncryptedEnvelope(file, node.type ?? node.initializer, resolveReference, visited)
  }
  if (ts.isTypeLiteralNode(node) || ts.isObjectLiteralExpression(node)) {
    const members = ts.isTypeLiteralNode(node) ? node.members : node.properties
    const fields = new Set(members.map((member) => normalizeName(nodeName(member.name))).filter(Boolean))
    return isEncryptedEnvelopeFieldSet(fields)
  }
  if (ts.isCallExpression(node)) {
    const name = calleeName(node.expression, node.getSourceFile())
    if (/(?:^|\.)object$/u.test(name) && node.arguments[0] &&
      provesEncryptedEnvelope(file, node.arguments[0], resolveReference, visited)) return true
    if (ts.isPropertyAccessExpression(node.expression) && ts.isCallExpression(node.expression.expression) &&
      provesEncryptedEnvelope(file, node.expression.expression, resolveReference, visited)) return true
    return node.typeArguments?.some((argument) =>
      provesEncryptedEnvelope(file, argument, resolveReference, visited)) ?? false
  }
  if (ts.isTypeReferenceNode(node)) {
    if (node.typeArguments?.some((argument) =>
      provesEncryptedEnvelope(file, argument, resolveReference, visited))) return true
    return resolveReference(file, node.typeName).some((target) =>
      provesEncryptedEnvelope(target.file, target.declaration, resolveReference, visited))
  }
  if (ts.isTypeQueryNode(node)) {
    return resolveReference(file, node.exprName).some((target) =>
      provesEncryptedEnvelope(target.file, target.declaration, resolveReference, visited))
  }
  if (ts.isIdentifier(node) || ts.isQualifiedName(node) || ts.isPropertyAccessExpression(node)) {
    const targets = resolveReference(file, node)
    return targets.some((target) =>
      provesEncryptedEnvelope(target.file, target.declaration, resolveReference, visited))
  }
  return false
}

function isProvenNonAuthorizingRepresentation(file, node, resolveReference) {
  const normalized = normalizeName(nodeName(node.name))
  if (!/^(?:encrypted|sealed)/u.test(normalized)) return false
  return provesEncryptedEnvelope(file, node, resolveReference)
}

function publicSignatureChildren(node, visit) {
  if (ts.isFunctionLike(node)) {
    if (node.name) visit(node.name)
    node.typeParameters?.forEach(visit)
    node.parameters.forEach(visit)
    if (node.type) visit(node.type)
    return
  }
  if (ts.isClassLike(node)) {
    if (node.name) visit(node.name)
    node.typeParameters?.forEach(visit)
    node.heritageClauses?.forEach(visit)
    for (const member of node.members) {
      const flags = ts.getCombinedModifierFlags(member)
      if ((flags & ts.ModifierFlags.Private) !== 0 || (flags & ts.ModifierFlags.Protected) !== 0) continue
      visit(member)
    }
    return
  }
  if (ts.isVariableDeclaration(node) && node.initializer &&
    (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) {
    visit(node.name)
    if (node.type) visit(node.type)
    publicSignatureChildren(node.initializer, visit)
    return
  }
  ts.forEachChild(node, visit)
}

function scanPublicDeclaration(
  file,
  sourceFile,
  declaration,
  addFinding,
  resolveReference = () => [],
  visited = new Set()
) {
  const declarationKey = `${file}:${declaration.pos}:${declaration.end}`
  if (visited.has(declarationKey)) return
  visited.add(declarationKey)
  if (isSyntheticDeclaration(declaration)) return
  const declarationIsSecretAuthority = secretAuthorityName(nodeName(declaration.name))
  if (declarationIsSecretAuthority) {
    addFinding(file, lineOf(sourceFile, declaration.name ?? declaration), 'public-secret-authority')
  }
  function visit(node) {
    if (ts.isPropertySignature(node) || ts.isPropertyDeclaration(node) || ts.isMethodSignature(node) ||
      ts.isMethodDeclaration(node) || ts.isParameter(node) || ts.isVariableDeclaration(node) ||
      ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node)) {
      if (!declarationIsSecretAuthority && secretAuthorityOperationName(nodeName(node.name))) {
        addFinding(file, lineOf(sourceFile, node.name ?? node), 'public-secret-authority')
      }
      const category = secretCategory(nodeName(node.name), {
        headerContext: isAuthorizationHeaderProperty(node, sourceFile)
      })
      if (category && !isProvenNonAuthorizingRepresentation(file, node, resolveReference)) {
        addFinding(file, lineOf(sourceFile, node.name ?? node), `public-secret-${category}`)
      }
    } else if (ts.isTypeReferenceNode(node) || ts.isExpressionWithTypeArguments(node)) {
      const reference = node.expression ?? node.typeName
      const category = secretCategory(reference.getText(sourceFile))
      if (category) addFinding(file, lineOf(sourceFile, reference), `public-secret-${category}`)
      if (secretAuthorityName(reference.getText(sourceFile))) {
        addFinding(file, lineOf(sourceFile, reference), 'public-secret-authority')
      }
      for (const target of resolveReference(file, reference)) {
        scanPublicDeclaration(
          target.file,
          target.sourceFile,
          target.declaration,
          addFinding,
          resolveReference,
          visited
        )
      }
    } else if (ts.isLiteralTypeNode(node) && ts.isStringLiteralLike(node.literal)) {
      const category = secretCategory(node.literal.text)
      if (category) addFinding(file, lineOf(sourceFile, node.literal), `public-secret-${category}`)
    }
    publicSignatureChildren(node, visit)
  }
  visit(declaration)
}

function sourceKind(file) {
  if (/\.tsx$/iu.test(file)) return ts.ScriptKind.TSX
  if (/\.jsx$/iu.test(file)) return ts.ScriptKind.JSX
  if (/\.(?:js|mjs|cjs)$/iu.test(file)) return ts.ScriptKind.JS
  return ts.ScriptKind.TS
}

function parseSource(file, source) {
  return ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, sourceKind(file))
}

function resolveSourceModule(root, fromFile, specifier, fileSet) {
  if (!specifier.startsWith('.')) return null
  const raw = normalizePath(relative(root, resolve(dirname(join(root, fromFile)), specifier)))
  const withoutRuntimeExtension = raw.replace(/\.(?:js|jsx|mjs|cjs|d\.ts)$/iu, '')
  const candidates = [
    raw,
    `${withoutRuntimeExtension}.ts`,
    `${withoutRuntimeExtension}.tsx`,
    `${withoutRuntimeExtension}.js`,
    `${withoutRuntimeExtension}.mjs`,
    `${withoutRuntimeExtension}/index.ts`,
    `${withoutRuntimeExtension}/index.tsx`,
    `${withoutRuntimeExtension}/index.js`
  ]
  return candidates.find((candidate) => fileSet.has(candidate)) ?? null
}

function exportedTargetStrings(exportsValue) {
  if (typeof exportsValue === 'string') return [exportsValue]
  if (Array.isArray(exportsValue)) return exportsValue.flatMap(exportedTargetStrings)
  if (!exportsValue || typeof exportsValue !== 'object') return []
  return Object.values(exportsValue).flatMap(exportedTargetStrings)
}

function sourceCandidateForExport(packageDirectory, target, fileSet) {
  if (!target.startsWith('./')) return null
  const relativeTarget = normalizePath(join(packageDirectory, target.slice(2)))
  const candidates = [relativeTarget]
  if (relativeTarget.includes('/dist/')) {
    const sourceBase = relativeTarget.replace('/dist/', '/src/').replace(/\.d\.ts$/iu, '').replace(/\.(?:js|jsx|mjs|cjs)$/iu, '')
    candidates.push(`${sourceBase}.ts`, `${sourceBase}.tsx`, `${sourceBase}.js`, `${sourceBase}/index.ts`, `${sourceBase}/index.tsx`)
  }
  return candidates.find((candidate) => fileSet.has(candidate)) ?? null
}

function packageSourceEntrypoints(root, files, fileSet) {
  const entrypoints = new Map()
  for (const file of files.filter((candidate) => candidate === 'package.json' || candidate.endsWith('/package.json'))) {
    let manifest
    try {
      manifest = JSON.parse(readFileSync(join(root, file), 'utf8'))
    } catch {
      continue
    }
    if (!manifest || typeof manifest.name !== 'string') continue
    const packageDirectory = normalizePath(dirname(file)) === '.' ? '' : normalizePath(dirname(file))
    const exportsValue = manifest.exports
    const entries = []
    if (exportsValue && typeof exportsValue === 'object' && !Array.isArray(exportsValue) &&
      Object.keys(exportsValue).some((key) => key.startsWith('.'))) {
      for (const [subpath, value] of Object.entries(exportsValue)) entries.push([subpath, value])
    } else if (exportsValue) {
      entries.push(['.', exportsValue])
    } else {
      entries.push(['.', [manifest.types, manifest.module, manifest.main].filter((value) => typeof value === 'string')])
    }
    for (const [subpath, value] of entries) {
      const candidate = exportedTargetStrings(value)
        .map((target) => sourceCandidateForExport(packageDirectory, target, fileSet))
        .find(Boolean)
      if (!candidate) continue
      const specifier = subpath === '.' ? manifest.name : `${manifest.name}/${subpath.replace(/^\.\//u, '')}`
      entrypoints.set(specifier, candidate)
    }
  }
  return entrypoints
}

function allPackageExports() {
  return { allNamed: true, names: new Set(['default']) }
}

function exactExports(names) {
  return { allNamed: false, names: new Set(names) }
}

function exportSelectionHas(selection, name) {
  return name === 'default' ? selection.names.has(name) : selection.allNamed || selection.names.has(name)
}

function mergeExportSelection(selections, file, incoming) {
  const current = selections.get(file)
  if (!current) {
    selections.set(file, {
      allNamed: incoming.allNamed,
      names: new Set(incoming.names)
    })
    return true
  }
  const mergedNames = new Set([...current.names, ...incoming.names])
  const allNamed = current.allNamed || incoming.allNamed
  if (allNamed === current.allNamed && mergedNames.size === current.names.size) return false
  selections.set(file, { allNamed, names: mergedNames })
  return true
}

function discoverPublicModules(root, files, sources) {
  const fileSet = new Set(files)
  const entrypoints = []
  for (const file of files.filter((candidate) => candidate.endsWith('/package.json') || candidate === 'package.json')) {
    let manifest
    try {
      manifest = JSON.parse(readFileSync(join(root, file), 'utf8'))
    } catch {
      continue
    }
    const packageDirectory = normalizePath(dirname(file)) === '.' ? '' : normalizePath(dirname(file))
    const targets = manifest.exports
      ? exportedTargetStrings(manifest.exports)
      : [manifest.types, manifest.module, manifest.main].filter((target) => typeof target === 'string')
    for (const target of targets) {
      const candidate = sourceCandidateForExport(packageDirectory, target, fileSet)
      if (candidate) entrypoints.push(candidate)
    }
  }

  const publicModules = new Map()
  const queue = []
  for (const entrypoint of new Set(entrypoints)) {
    if (mergeExportSelection(publicModules, entrypoint, allPackageExports())) queue.push(entrypoint)
  }
  while (queue.length > 0) {
    const file = queue.shift()
    if (!file) continue
    const selection = publicModules.get(file)
    if (!selection) continue
    const sourceFile = sources.get(file)
    if (!sourceFile) continue
    for (const statement of sourceFile.statements) {
      if (!ts.isExportDeclaration(statement) || !statement.moduleSpecifier ||
        !ts.isStringLiteralLike(statement.moduleSpecifier)) continue
      const resolved = resolveSourceModule(root, file, statement.moduleSpecifier.text, fileSet)
      if (!resolved) continue

      let forwarded
      if (!statement.exportClause) {
        forwarded = exactExports([...selection.names].filter((name) => name !== 'default'))
        forwarded.allNamed = selection.allNamed
      } else if (ts.isNamedExports(statement.exportClause)) {
        forwarded = exactExports(statement.exportClause.elements
          .filter((element) => exportSelectionHas(selection, element.name.text))
          .map((element) => (element.propertyName ?? element.name).text))
      } else if (ts.isNamespaceExport(statement.exportClause) &&
        exportSelectionHas(selection, statement.exportClause.name.text)) {
        forwarded = allPackageExports()
      } else {
        forwarded = exactExports([])
      }
      if ((forwarded.allNamed || forwarded.names.size > 0) &&
        mergeExportSelection(publicModules, resolved, forwarded)) queue.push(resolved)
    }
  }
  return publicModules
}

function hasModifier(node, kind) {
  return Boolean(node.modifiers?.some((modifier) => modifier.kind === kind))
}

function bindingNames(name) {
  if (ts.isIdentifier(name)) return [name.text]
  if (!ts.isArrayBindingPattern(name) && !ts.isObjectBindingPattern(name)) return []
  return name.elements.flatMap((element) => ts.isBindingElement(element) ? bindingNames(element.name) : [])
}

function exportedDeclarations(sourceFile, selection) {
  const declarations = []
  const locallyExported = new Set()
  for (const statement of sourceFile.statements) {
    if (ts.isExportDeclaration(statement) && !statement.moduleSpecifier && statement.exportClause &&
      ts.isNamedExports(statement.exportClause)) {
      for (const element of statement.exportClause.elements) {
        if (exportSelectionHas(selection, element.name.text)) {
          locallyExported.add((element.propertyName ?? element.name).text)
        }
      }
    }
  }
  for (const statement of sourceFile.statements) {
    if (ts.isExportAssignment(statement) && exportSelectionHas(selection, 'default')) {
      declarations.push(statement.expression)
    }
    if (ts.isVariableStatement(statement)) {
      const exported = hasModifier(statement, ts.SyntaxKind.ExportKeyword)
      for (const declaration of statement.declarationList.declarations) {
        const names = bindingNames(declaration.name)
        if ((exported && names.some((name) => exportSelectionHas(selection, name))) ||
          names.some((name) => locallyExported.has(name))) declarations.push(declaration)
      }
      continue
    }
    const declarationName = nodeName(statement.name)
    const directlyExported = hasModifier(statement, ts.SyntaxKind.DefaultKeyword)
      ? exportSelectionHas(selection, 'default')
      : hasModifier(statement, ts.SyntaxKind.ExportKeyword) && declarationName &&
        exportSelectionHas(selection, declarationName)
    if (directlyExported || (declarationName && locallyExported.has(declarationName))) {
      declarations.push(statement)
    }
  }
  return declarations
}

function addIndexedDeclaration(index, name, declaration) {
  if (!name) return
  const declarations = index.get(name) ?? []
  declarations.push(declaration)
  index.set(name, declarations)
}

function createPublicReferenceResolver(root, files, sources) {
  const fileSet = new Set(files)
  const packageEntrypoints = packageSourceEntrypoints(root, files, fileSet)
  const declarationsByFile = new Map()
  const importsByFile = new Map()
  const reExportsByFile = new Map()

  const resolveModule = (fromFile, specifier) => (
    resolveSourceModule(root, fromFile, specifier, fileSet) ?? packageEntrypoints.get(specifier) ?? null
  )

  for (const [file, sourceFile] of sources) {
    const declarations = new Map()
    const imports = new Map()
    const reExports = []
    for (const statement of sourceFile.statements) {
      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          for (const name of bindingNames(declaration.name)) {
            addIndexedDeclaration(declarations, name, declaration)
          }
        }
      } else if (ts.isExportAssignment(statement)) {
        addIndexedDeclaration(declarations, 'default', statement.expression)
      } else {
        const name = nodeName(statement.name)
        if (name) addIndexedDeclaration(declarations, name, statement)
        if (hasModifier(statement, ts.SyntaxKind.DefaultKeyword)) {
          addIndexedDeclaration(declarations, 'default', statement)
        }
      }

      if (ts.isExportDeclaration(statement) && statement.moduleSpecifier &&
        ts.isStringLiteralLike(statement.moduleSpecifier)) {
        const targetFile = resolveModule(file, statement.moduleSpecifier.text)
        if (targetFile) {
          if (!statement.exportClause) {
            reExports.push({ targetFile, allNamed: true })
          } else if (ts.isNamedExports(statement.exportClause)) {
            for (const element of statement.exportClause.elements) {
              reExports.push({
                targetFile,
                allNamed: false,
                exportedName: element.name.text,
                targetName: (element.propertyName ?? element.name).text
              })
            }
          }
        }
      }

      if (!ts.isImportDeclaration(statement) || !statement.importClause ||
        !ts.isStringLiteralLike(statement.moduleSpecifier)) continue
      const targetFile = resolveModule(file, statement.moduleSpecifier.text)
      if (!targetFile) continue
      if (statement.importClause.name) {
        imports.set(statement.importClause.name.text, { targetFile, targetName: 'default' })
      }
      const bindings = statement.importClause.namedBindings
      if (bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          imports.set(element.name.text, {
            targetFile,
            targetName: (element.propertyName ?? element.name).text
          })
        }
      } else if (bindings && ts.isNamespaceImport(bindings)) {
        imports.set(bindings.name.text, { targetFile, namespace: true })
      }
    }
    declarationsByFile.set(file, declarations)
    importsByFile.set(file, imports)
    reExportsByFile.set(file, reExports)
  }

  const targets = (file, name, visited = new Set()) => {
    const key = `${file}:${name}`
    if (visited.has(key)) return []
    visited.add(key)
    const direct = (declarationsByFile.get(file)?.get(name) ?? []).map((declaration) => ({
      file,
      sourceFile: sources.get(file),
      declaration
    })).filter((target) => target.sourceFile)
    const forwarded = (reExportsByFile.get(file) ?? []).flatMap((entry) => {
      if (!entry.allNamed && entry.exportedName !== name) return []
      return targets(entry.targetFile, entry.allNamed ? name : entry.targetName, visited)
    })
    return [...direct, ...forwarded]
  }

  return (file, reference) => {
    if (ts.isIdentifier(reference)) {
      const local = targets(file, reference.text)
      if (local.length > 0) return local
      const imported = importsByFile.get(file)?.get(reference.text)
      if (!imported || imported.namespace) return []
      return targets(imported.targetFile, imported.targetName)
    }
    if (ts.isQualifiedName(reference) && ts.isIdentifier(reference.left)) {
      const imported = importsByFile.get(file)?.get(reference.left.text)
      if (!imported?.namespace) return []
      return targets(imported.targetFile, reference.right.text)
    }
    if (ts.isPropertyAccessExpression(reference) && ts.isIdentifier(reference.expression)) {
      const imported = importsByFile.get(file)?.get(reference.expression.text)
      if (!imported?.namespace) return []
      return targets(imported.targetFile, reference.name.text)
    }
    return []
  }
}

function scanBoundaryProperties(file, sourceFile, addFinding, resolveReference) {
  function visit(node) {
    if (ts.isPropertySignature(node) || ts.isPropertyDeclaration(node) || ts.isPropertyAssignment(node) ||
      ts.isShorthandPropertyAssignment(node) || ts.isParameter(node) || ts.isVariableDeclaration(node) ||
      ts.isBindingElement(node)) {
      const name = nodeName(node.name)
      const category = secretCategory(name, {
        headerContext: isAuthorizationHeaderProperty(node, sourceFile)
      })
      if (category && !isProvenNonAuthorizingRepresentation(file, node, resolveReference)) {
        addFinding(file, lineOf(sourceFile, node.name ?? node), `boundary-secret-${category}`)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
}

function scanSinks(file, sourceFile, addFinding) {
  const syntheticTest = testPath.test(file)
  const taintsFor = createTaintResolver(sourceFile)
  function visit(node) {
    if (!syntheticTest && (ts.isVariableDeclaration(node) || ts.isPropertyAssignment(node) ||
      ts.isPropertyDeclaration(node))) {
      const name = nodeName(node.name)
      if (/receipt|evidence/iu.test(name) && node.initializer) {
        const initializer = unwrapAliasExpression(node.initializer)
        const receiptCarriesValue = receiptFilePath.test(file) ||
          ts.isArrayLiteralExpression(initializer) || ts.isObjectLiteralExpression(initializer) ||
          (ts.isCallExpression(initializer) && isMaterialPreservingCall(initializer, sourceFile))
        const sensitive = receiptCarriesValue
          ? containsSensitiveExpression(initializer, sourceFile, taintsFor(node))
          : null
        if (sensitive) {
          addFinding(file, lineOf(sourceFile, sensitive.node), `secret-receipt-${sensitive.category}`)
        }
      }
    }
    if (ts.isCallExpression(node)) {
      const name = calleeName(node.expression, sourceFile)
      const expression = node.arguments.length === 1 ? node.arguments[0] : node
      const environmentSource = containsEnvironmentSource(expression, sourceFile)
      const sensitive = containsSensitiveExpression(expression, sourceFile, taintsFor(node)) ??
        (environmentSource ? { node: environmentSource, category: 'environment' } : null)
      if (sensitive && (!syntheticTest || environmentSource)) {
        if (logSinkName.test(name)) {
          addFinding(file, lineOf(sourceFile, sensitive.node), `secret-log-${sensitive.category}`)
        } else if (isProcessSink(name) || processIoSinkName.test(name)) {
          addFinding(file, lineOf(sourceFile, sensitive.node), `secret-process-${sensitive.category}`)
        } else if (isIpcSink(name, file)) {
          addFinding(file, lineOf(sourceFile, sensitive.node), `secret-ipc-${sensitive.category}`)
        } else if (receiptSinkName.test(name) || (receiptFilePath.test(file) && /JSON\.stringify$/u.test(name))) {
          addFinding(file, lineOf(sourceFile, sensitive.node), `secret-receipt-${sensitive.category}`)
        } else if (persistenceSinkName.test(name) && !isSecurePersistenceSink(name, file)) {
          addFinding(file, lineOf(sourceFile, sensitive.node), `insecure-secret-persistence-${sensitive.category}`)
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
}

function literalText(node) {
  if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  return null
}

function looksLikeCredentialLiteral(value) {
  if (isPlaceholder(value)) return false
  if (/^(?:Bearer|Basic)\s+\S+/u.test(value)) return true
  if (/^(?:agent|device|user|provider)[._-][A-Za-z0-9_-]{16,}$/u.test(value)) return true
  return value.length >= 24 && /^[A-Za-z0-9+/_=-]+$/u.test(value) && /[A-Za-z]/u.test(value) && /[0-9]/u.test(value)
}

function scanLiteralAssignments(file, sourceFile, addFinding) {
  function visit(node) {
    let name = ''
    let valueNode = null
    if (ts.isVariableDeclaration(node) || ts.isPropertyDeclaration(node) || ts.isPropertyAssignment(node) ||
      ts.isParameter(node)) {
      name = nodeName(node.name)
      valueNode = node.initializer ?? null
    } else if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      name = ts.isPropertyAccessExpression(node.left) ? node.left.name.text : nodeName(node.left)
      valueNode = node.right
    }
    if (name && valueNode) {
      const category = secretCategory(name, {
        headerContext: normalizeName(name) === 'authorization'
      })
      const value = literalText(valueNode)
      if (category && value !== null && looksLikeCredentialLiteral(value) &&
        (!testPath.test(file) || !isExplicitSyntheticText(value))) {
        addFinding(file, lineOf(sourceFile, valueNode), `literal-secret-assignment-${category}`)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
}

function isPlaceholder(value) {
  const normalized = value.trim().toLowerCase()
  return !normalized || /^(?:<[^>]+>|\$\{[^}]+\}|\$[a-z_][a-z0-9_]*|\*+|x+|redacted|changeme|change-me|replace-me|example|placeholder|test-only|invalid-test-only)$/iu.test(normalized)
}

function isExplicitSyntheticText(value) {
  return /invalid[_ -]*test[_ -]*only|synthetic|test[_ -]*only|fixture|dummy|fake|mock|example/iu.test(value) ||
    /^(?:Bearer\s+)?(?:secret|caller[-_][A-Za-z0-9_-]*|local[-_][A-Za-z0-9_-]*)$/iu.test(value.trim())
}

function scanText(file, source, addFinding) {
  const syntheticTest = testPath.test(file)
  const structuredSource = sourceExtensions.has(extname(file).toLowerCase()) || extname(file).toLowerCase() === '.json'
  const lines = source.split('\n')
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    for (const [kind, detector] of credentialShapeDetectors) {
      const match = line.match(detector)
      if (match && (!syntheticTest || !isExplicitSyntheticText(match[0]))) {
        addFinding(file, index + 1, kind)
      }
    }
    const assignment = structuredSource
      ? null
      : line.match(/\b([A-Za-z_][A-Za-z0-9_.-]*)\s*[:=]\s*['"]?([^'"\s,;#]{8,})/u)
    if (assignment && looksLikeCredentialLiteral(assignment[2]) &&
      (!syntheticTest || !isExplicitSyntheticText(line))) {
      const category = secretCategory(assignment[1], {
        headerContext: normalizeName(assignment[1]) === 'authorization'
      })
      if (category) {
        addFinding(file, index + 1, `literal-secret-assignment-${category}`)
      }
    }
  }
}

function scanJson(file, source, addFinding) {
  let value
  try {
    value = JSON.parse(source)
  } catch {
    return
  }
  const boundary = boundaryFilePath.test(file) || rendererPath.test(file) || receiptFilePath.test(file)
  function visit(current, path = []) {
    if (Array.isArray(current)) {
      current.forEach((item, index) => visit(item, [...path, index]))
      return
    }
    if (!current || typeof current !== 'object') return
    for (const [childKey, childValue] of Object.entries(current)) {
      const category = secretCategory(childKey, {
        headerContext: childKey.toLowerCase() === 'authorization' &&
          (path.some((part) => /header|request/iu.test(String(part))) || /header|request|transport/iu.test(file))
      })
      if (boundary && category) addFinding(file, 1, `boundary-secret-${category}`)
      visit(childValue, [...path, childKey])
    }
  }
  visit(value)
}

function walkFiles(root) {
  const files = []
  const stack = [root]
  while (stack.length > 0) {
    const current = stack.pop()
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'vendor') continue
      const absolute = join(current, entry.name)
      if (entry.isDirectory()) stack.push(absolute)
      else if (entry.isFile()) files.push(normalizePath(relative(root, absolute)))
    }
  }
  return files.sort()
}

function gitFiles(root) {
  return execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], {
    cwd: root,
    encoding: 'utf8'
  }).split('\0').filter(Boolean).map(normalizePath).sort()
}

function packageManifestRecords(root, files) {
  const records = []
  for (const file of files) {
    if (file !== 'package.json' && !file.endsWith('/package.json')) continue
    let manifest
    try {
      manifest = JSON.parse(readFileSync(join(root, file), 'utf8'))
    } catch {
      continue
    }
    if (!manifest || typeof manifest !== 'object') continue
    const directory = normalizePath(dirname(file)) === '.' ? '' : normalizePath(dirname(file))
    const dependencies = new Set()
    for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
      const values = manifest[field]
      if (!values || typeof values !== 'object') continue
      for (const name of Object.keys(values)) dependencies.add(name)
    }
    records.push({
      directory,
      name: typeof manifest.name === 'string' ? manifest.name : '',
      dependencies
    })
  }
  return records
}

function isMeetingLoopPackage(record) {
  if (record.directory === 'packages/domain-sdk') return true
  const localName = record.name.split('/').at(-1) ?? ''
  return meetingLoopPackageSegment.test(localName)
}

function fileWithinDirectory(file, directory) {
  return directory ? file === directory || file.startsWith(`${directory}/`) : false
}

function hostComposedWorkerNames(root, candidateFiles) {
  const names = new Set()
  const importPattern = /(?:from\s+|import\s*(?:\(\s*)?|require\s*\(\s*)['"](@sciforge\/[^/'"]+)/gu
  for (const file of candidateFiles) {
    if (testPath.test(file) ||
      (!hostSecurityBoundaryPath.test(file) && !hostCompositionPath.test(file))) continue
    let source
    try {
      source = readFileSync(join(root, file), 'utf8')
    } catch {
      continue
    }
    for (const match of source.matchAll(importPattern)) names.add(match[1])
  }
  return names
}

function discoverMeetingLoopSecurityFiles(root, candidateFiles) {
  const records = packageManifestRecords(root, candidateFiles)
  const recordByName = new Map(records
    .filter((record) => record.name)
    .map((record) => [record.name, record]))
  const selectedDirectories = new Set(records.filter(isMeetingLoopPackage).map((record) => record.directory))
  const rootRecord = records.find((record) => record.directory === '')
  for (const dependency of rootRecord?.dependencies ?? []) {
    const target = recordByName.get(dependency)
    if (target) selectedDirectories.add(target.directory)
  }
  for (const packageName of hostComposedWorkerNames(root, candidateFiles)) {
    const target = recordByName.get(packageName)
    if (target?.directory.startsWith('packages/workers/')) selectedDirectories.add(target.directory)
  }

  const queue = [...selectedDirectories]
  while (queue.length > 0) {
    const directory = queue.shift()
    const record = records.find((candidate) => candidate.directory === directory)
    if (!record) continue
    for (const dependency of record.dependencies) {
      const target = recordByName.get(dependency)
      if (!target || selectedDirectories.has(target.directory)) continue
      selectedDirectories.add(target.directory)
      queue.push(target.directory)
    }
  }

  return new Set(candidateFiles.filter((file) => (
    hostSecurityBoundaryPath.test(file) ||
    hostCompositionPath.test(file) ||
    meetingLoopArtifactPath.test(file) ||
    [...selectedDirectories].some((directory) => fileWithinDirectory(file, directory))
  )))
}

export function auditRoot({
  root = process.cwd(),
  scanAll = false,
  useGit = true,
  includeOwnFixtures = false
} = {}) {
  const absoluteRoot = resolve(root)
  const candidateFiles = useGit ? gitFiles(absoluteRoot) : walkFiles(absoluteRoot)
  const meetingLoopSecurityFiles = scanAll
    ? null
    : discoverMeetingLoopSecurityFiles(absoluteRoot, candidateFiles)
  const files = candidateFiles
    .filter((file) => file !== 'package-lock.json' && !file.startsWith('vendor/'))
    .filter((file) => includeOwnFixtures || !ownAuditFixturePath.test(file))
    .filter((file) => scanAll || !testPath.test(file))
    .filter((file) => scanAll || meetingLoopSecurityFiles.has(file))

  const findings = []
  const findingKeys = new Set()
  const addFinding = (file, line, kind) => {
    const key = `${file}:${line}:${kind}`
    if (findingKeys.has(key)) return
    findingKeys.add(key)
    findings.push({ file, line, kind })
  }
  const sources = new Map()
  const contents = new Map()

  for (const file of files) {
    const absolute = join(absoluteRoot, file)
    let metadata
    try {
      metadata = statSync(absolute)
    } catch {
      continue
    }
    if (!metadata.isFile() || metadata.size > maxFileBytes) continue
    let source
    try {
      source = readFileSync(absolute, 'utf8')
    } catch {
      continue
    }
    if (source.includes('\0')) continue
    if (sensitiveFileName.test(file) &&
      (!testPath.test(file) || !isExplicitSyntheticText(source))) {
      addFinding(file, 0, 'sensitive-file-name')
    }
    contents.set(file, source)
    scanText(file, source, addFinding)
    const extension = extname(file).toLowerCase()
    if (sourceExtensions.has(extension)) sources.set(file, parseSource(file, source))
    if (extension === '.json') scanJson(file, source, addFinding)
  }

  const publicModules = discoverPublicModules(absoluteRoot, [...contents.keys()], sources)
  const resolvePublicReference = createPublicReferenceResolver(
    absoluteRoot,
    [...contents.keys()],
    sources
  )
  const visitedPublicDeclarations = new Set()
  for (const [file, sourceFile] of sources) {
    const exportSelection = publicModules.get(file)
    if (exportSelection) {
      for (const declaration of exportedDeclarations(sourceFile, exportSelection)) {
        scanPublicDeclaration(
          file,
          sourceFile,
          declaration,
          addFinding,
          resolvePublicReference,
          visitedPublicDeclarations
        )
      }
    }
    if (!testPath.test(file) && (boundaryFilePath.test(file) || (scanAll && rendererPath.test(file)))) {
      scanBoundaryProperties(file, sourceFile, addFinding, resolvePublicReference)
    }
    scanSinks(file, sourceFile, addFinding)
    scanLiteralAssignments(file, sourceFile, addFinding)
  }

  return {
    root: absoluteRoot,
    scope: scanAll ? 'repository' : 'meeting-loop-security-boundary',
    scannedFiles: contents.size,
    publicModules: [...publicModules.keys()].sort(),
    findings: findings.sort((left, right) => (
      left.file.localeCompare(right.file) || left.line - right.line || left.kind.localeCompare(right.kind)
    ))
  }
}

function printPolicy() {
  process.stdout.write(`SciForge collaboration secret-boundary audit\n\n`)
  process.stdout.write(`The default gate discovers the production meeting-loop boundary from package manifests,\n`)
  process.stdout.write(`root composition/imports, and internal dependencies; --all remains a repository diagnostic.\n`)
  process.stdout.write(`The audit resolves package export graphs and rejects secret-bearing fields in public APIs.\n`)
  process.stdout.write(`It also rejects secret-bearing values at IPC/message, log/telemetry, receipt/evidence,\n`)
  process.stdout.write(`and ordinary persistence sinks. Identity and Connector main-process code may hold and\n`)
  process.stdout.write(`use secrets internally, but it is not exempt from those outbound sinks. Native secret\n`)
  process.stdout.write(`stores, structurally proven encrypted envelopes, digests, expiry metadata, and explicit synthetic test\n`)
  process.stdout.write(`values are non-secret representations. Opaque/handle/reference/ref/id naming is not an\n`)
  process.stdout.write(`exemption when possession authorizes an operation; bearer capability handles are secrets.\n`)
  process.stdout.write(`Names such as redact, sanitize, mask, encrypt, or seal never clear secret taint by themselves.\n`)
  process.stdout.write(`Public cross-package ports that can read, write, return, or callback with raw secret values\n`)
  process.stdout.write(`are rejected even when both callers currently run in a trusted main process.\n`)
}

function parseArgs(argv) {
  const options = { root: process.cwd(), scanAll: false, useGit: true, json: false, explain: false }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--all') options.scanAll = true
    else if (argument === '--json') options.json = true
    else if (argument === '--explain') options.explain = true
    else if (argument === '--root') {
      const root = argv[++index]
      if (!root) throw new Error('--root requires a directory.')
      options.root = root
      options.useGit = false
      options.scanAll = true
    } else if (argument === '--help' || argument === '-h') {
      process.stdout.write('Usage: node scripts/collaboration-secret-audit.mjs [--all] [--root DIR] [--json] [--explain]\n')
      process.exit(0)
    } else throw new Error(`Unknown argument: ${argument}`)
  }
  return options
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.explain) printPolicy()
  if (!existsSync(options.root)) throw new Error(`Audit root does not exist: ${options.root}`)
  const result = auditRoot(options)
  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  } else if (result.findings.length > 0) {
    for (const finding of result.findings) {
      process.stderr.write(`${finding.file}:${finding.line}:${finding.kind}\n`)
    }
    process.stderr.write(`collaboration-secret-audit: ${result.findings.length} redacted finding(s) in ${result.scannedFiles} file(s)\n`)
  } else {
    process.stdout.write(`collaboration-secret-audit: pass (${result.scope}, ${result.scannedFiles} file(s))\n`)
  }
  if (result.findings.length > 0) process.exitCode = 1
}

const invokedAsScript = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url
if (invokedAsScript) main()
