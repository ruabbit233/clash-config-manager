import type { CompletionContext, CompletionResult, Completion } from '@codemirror/autocomplete'

interface ClashKey {
  label: string
  detail: string
  info?: string
  type?: string
}

const TOP_LEVEL: ClashKey[] = [
  { label: 'port', detail: 'number', info: 'HTTP 代理端口', type: 'property' },
  { label: 'socks-port', detail: 'number', info: 'SOCKS5 代理端口', type: 'property' },
  { label: 'mixed-port', detail: 'number', info: 'HTTP + SOCKS 混合端口', type: 'property' },
  { label: 'redir-port', detail: 'number', info: '透明代理 (TCP)', type: 'property' },
  { label: 'tproxy-port', detail: 'number', info: 'TPROXY 端口 (Linux)', type: 'property' },
  { label: 'allow-lan', detail: 'boolean', info: '允许局域网连接', type: 'property' },
  { label: 'bind-address', detail: 'string', info: '监听地址 (* 表示全部)', type: 'property' },
  {
    label: 'mode',
    detail: "'rule' | 'global' | 'direct'",
    info: '代理模式',
    type: 'property',
  },
  {
    label: 'log-level',
    detail: "'silent' | 'error' | 'warning' | 'info' | 'debug'",
    info: '日志级别',
    type: 'property',
  },
  { label: 'ipv6', detail: 'boolean', info: '启用 IPv6', type: 'property' },
  {
    label: 'external-controller',
    detail: 'string',
    info: 'RESTful API 地址，如 0.0.0.0:9090',
    type: 'property',
  },
  { label: 'external-ui', detail: 'string', info: 'Web UI 静态资源目录', type: 'property' },
  { label: 'secret', detail: 'string', info: 'RESTful API 密钥', type: 'property' },
  { label: 'tcp-concurrent', detail: 'boolean', info: 'TCP 并发连接 (Mihomo)', type: 'property' },
  {
    label: 'find-process-mode',
    detail: "'always' | 'strict' | 'off'",
    info: '进程匹配 (Mihomo)',
    type: 'property',
  },
  {
    label: 'global-client-fingerprint',
    detail: 'string',
    info: 'TLS 指纹 (Mihomo)',
    type: 'property',
  },
  {
    label: 'geodata-mode',
    detail: 'boolean',
    info: '使用 V2Ray geodata 格式 (Mihomo)',
    type: 'property',
  },
  {
    label: 'geo-auto-update',
    detail: 'boolean',
    info: '自动更新 geo 数据 (Mihomo)',
    type: 'property',
  },
  {
    label: 'geo-update-interval',
    detail: 'number (hours)',
    info: 'geo 更新间隔 (Mihomo)',
    type: 'property',
  },
  {
    label: 'profile',
    detail: 'object { store-selected, store-fake-ip }',
    info: '持久化设置',
    type: 'property',
  },
  { label: 'proxies', detail: 'Proxy[]', info: '代理节点列表', type: 'property' },
  { label: 'proxy-groups', detail: 'ProxyGroup[]', info: '代理策略组', type: 'property' },
  { label: 'proxy-providers', detail: 'object', info: '代理提供者', type: 'property' },
  { label: 'rule-providers', detail: 'object', info: '规则提供者', type: 'property' },
  { label: 'rules', detail: 'string[]', info: '路由规则', type: 'property' },
  { label: 'sub-rules', detail: 'object (Mihomo)', info: '子规则集', type: 'property' },
  { label: 'dns', detail: 'object', info: 'DNS 配置', type: 'property' },
  { label: 'tun', detail: 'object', info: 'TUN 模式 (Mihomo)', type: 'property' },
  { label: 'sniffer', detail: 'object (Mihomo)', info: '流量嗅探', type: 'property' },
  { label: 'hosts', detail: 'object', info: '静态 hosts 映射', type: 'property' },
  { label: 'experimental', detail: 'object', info: '实验性选项', type: 'property' },
  {
    label: 'authentication',
    detail: 'string[]',
    info: 'HTTP/SOCKS 认证 user:pass 列表',
    type: 'property',
  },
  { label: 'listeners', detail: 'object[] (Mihomo)', info: '入站监听器', type: 'property' },
]

const DNS_KEYS: ClashKey[] = [
  { label: 'enable', detail: 'boolean', type: 'property' },
  { label: 'ipv6', detail: 'boolean', type: 'property' },
  { label: 'listen', detail: 'string', info: '如 0.0.0.0:53', type: 'property' },
  {
    label: 'enhanced-mode',
    detail: "'fake-ip' | 'redir-host'",
    type: 'property',
  },
  { label: 'fake-ip-range', detail: 'string', info: '如 198.18.0.1/16', type: 'property' },
  { label: 'fake-ip-filter', detail: 'string[]', type: 'property' },
  { label: 'default-nameserver', detail: 'string[]', type: 'property' },
  { label: 'nameserver', detail: 'string[]', type: 'property' },
  { label: 'fallback', detail: 'string[]', type: 'property' },
  { label: 'fallback-filter', detail: 'object', type: 'property' },
  { label: 'nameserver-policy', detail: 'object', type: 'property' },
  { label: 'use-hosts', detail: 'boolean', type: 'property' },
  { label: 'use-system-hosts', detail: 'boolean', type: 'property' },
  { label: 'respect-rules', detail: 'boolean (Mihomo)', type: 'property' },
]

const TUN_KEYS: ClashKey[] = [
  { label: 'enable', detail: 'boolean', type: 'property' },
  { label: 'stack', detail: "'system' | 'gvisor' | 'mixed'", type: 'property' },
  { label: 'device', detail: 'string', type: 'property' },
  { label: 'dns-hijack', detail: 'string[]', type: 'property' },
  { label: 'auto-route', detail: 'boolean', type: 'property' },
  { label: 'auto-detect-interface', detail: 'boolean', type: 'property' },
  { label: 'mtu', detail: 'number', type: 'property' },
  { label: 'strict-route', detail: 'boolean', type: 'property' },
]

const PROXY_KEYS: ClashKey[] = [
  { label: 'name', detail: 'string', type: 'property' },
  {
    label: 'type',
    detail:
      "'ss' | 'ssr' | 'vmess' | 'vless' | 'trojan' | 'hysteria' | 'hysteria2' | 'tuic' | 'wireguard' | 'http' | 'socks5'",
    type: 'property',
  },
  { label: 'server', detail: 'string', type: 'property' },
  { label: 'port', detail: 'number', type: 'property' },
  { label: 'password', detail: 'string', type: 'property' },
  { label: 'cipher', detail: 'string', type: 'property' },
  { label: 'uuid', detail: 'string', info: 'vmess/vless', type: 'property' },
  { label: 'alterId', detail: 'number', info: 'vmess', type: 'property' },
  { label: 'tls', detail: 'boolean', type: 'property' },
  { label: 'skip-cert-verify', detail: 'boolean', type: 'property' },
  { label: 'sni', detail: 'string', type: 'property' },
  { label: 'network', detail: "'ws' | 'h2' | 'grpc' | 'tcp'", type: 'property' },
  { label: 'ws-opts', detail: 'object', type: 'property' },
  { label: 'grpc-opts', detail: 'object', type: 'property' },
  { label: 'udp', detail: 'boolean', type: 'property' },
]

const PROXY_GROUP_KEYS: ClashKey[] = [
  { label: 'name', detail: 'string', type: 'property' },
  {
    label: 'type',
    detail: "'select' | 'url-test' | 'fallback' | 'load-balance' | 'relay'",
    type: 'property',
  },
  { label: 'proxies', detail: 'string[]', type: 'property' },
  { label: 'use', detail: 'string[]', info: 'use proxy-providers', type: 'property' },
  { label: 'url', detail: 'string', info: '健康检查 URL', type: 'property' },
  { label: 'interval', detail: 'number (s)', type: 'property' },
  { label: 'tolerance', detail: 'number (ms)', type: 'property' },
  { label: 'lazy', detail: 'boolean', type: 'property' },
  {
    label: 'strategy',
    detail: "'consistent-hashing' | 'round-robin' | 'sticky-sessions'",
    type: 'property',
  },
  { label: 'filter', detail: 'string (regex)', type: 'property' },
  { label: 'disable-udp', detail: 'boolean', type: 'property' },
]

const RULE_TYPES: ClashKey[] = [
  { label: 'DOMAIN', detail: 'rule', info: 'DOMAIN,example.com,Proxy', type: 'enum' },
  { label: 'DOMAIN-SUFFIX', detail: 'rule', type: 'enum' },
  { label: 'DOMAIN-KEYWORD', detail: 'rule', type: 'enum' },
  { label: 'DOMAIN-REGEX', detail: 'rule (Mihomo)', type: 'enum' },
  { label: 'GEOSITE', detail: 'rule (Mihomo)', type: 'enum' },
  { label: 'IP-CIDR', detail: 'rule', type: 'enum' },
  { label: 'IP-CIDR6', detail: 'rule', type: 'enum' },
  { label: 'IP-SUFFIX', detail: 'rule (Mihomo)', type: 'enum' },
  { label: 'GEOIP', detail: 'rule', type: 'enum' },
  { label: 'SRC-IP-CIDR', detail: 'rule', type: 'enum' },
  { label: 'SRC-PORT', detail: 'rule', type: 'enum' },
  { label: 'DST-PORT', detail: 'rule', type: 'enum' },
  { label: 'PROCESS-NAME', detail: 'rule', type: 'enum' },
  { label: 'PROCESS-PATH', detail: 'rule', type: 'enum' },
  { label: 'RULE-SET', detail: 'rule', type: 'enum' },
  { label: 'NETWORK', detail: 'rule (Mihomo)', type: 'enum' },
  { label: 'AND', detail: 'rule (Mihomo)', type: 'enum' },
  { label: 'OR', detail: 'rule (Mihomo)', type: 'enum' },
  { label: 'NOT', detail: 'rule (Mihomo)', type: 'enum' },
  { label: 'MATCH', detail: 'rule (catch-all)', type: 'enum' },
]

const PROVIDER_KEYS: ClashKey[] = [
  { label: 'type', detail: "'http' | 'file' | 'inline'", type: 'property' },
  { label: 'url', detail: 'string', type: 'property' },
  { label: 'path', detail: 'string', type: 'property' },
  { label: 'interval', detail: 'number (s)', type: 'property' },
  { label: 'behavior', detail: "'domain' | 'ipcidr' | 'classical'", type: 'property' },
  { label: 'format', detail: "'yaml' | 'text' | 'mrs'", type: 'property' },
  { label: 'health-check', detail: 'object', type: 'property' },
  { label: 'proxy', detail: 'string', info: '通过指定代理拉取', type: 'property' },
]

const toCompletion = (key: ClashKey): Completion => ({
  label: key.label,
  detail: key.detail,
  info: key.info,
  type: key.type ?? 'property',
})

const buildOptions = (keys: ClashKey[]): Completion[] => keys.map(toCompletion)

const TOP_OPTIONS = buildOptions(TOP_LEVEL)
const DNS_OPTIONS = buildOptions(DNS_KEYS)
const TUN_OPTIONS = buildOptions(TUN_KEYS)
const PROXY_OPTIONS = buildOptions(PROXY_KEYS)
const PROXY_GROUP_OPTIONS = buildOptions(PROXY_GROUP_KEYS)
const RULE_OPTIONS = buildOptions(RULE_TYPES)
const PROVIDER_OPTIONS = buildOptions(PROVIDER_KEYS)

/**
 * Pick suggestions based on the YAML section the cursor is in. We don't
 * fully parse the document — a cheap "scan upward for the most-recent
 * top-level key with our indent ≤ 2 spaces" heuristic covers the common
 * cases (top-level key, inside `dns:`, inside `tun:`, inside `rules:`).
 *
 * The heuristic intentionally errs toward showing more options rather than
 * fewer — false negatives are worse than false positives in autocomplete.
 */
const detectSection = (textBefore: string): Completion[] => {
  const lines = textBefore.split('\n')
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i]
    const m = line.match(/^([a-zA-Z][\w-]*)\s*:/)
    if (!m) continue
    const indent = line.length - line.trimStart().length
    if (indent > 0) continue
    const key = m[1]
    if (key === 'dns') return [...DNS_OPTIONS, ...TOP_OPTIONS]
    if (key === 'tun') return [...TUN_OPTIONS, ...TOP_OPTIONS]
    if (key === 'proxies') return [...PROXY_OPTIONS, ...TOP_OPTIONS]
    if (key === 'proxy-groups') return [...PROXY_GROUP_OPTIONS, ...TOP_OPTIONS]
    if (key === 'rules') return [...RULE_OPTIONS, ...TOP_OPTIONS]
    if (key === 'proxy-providers' || key === 'rule-providers') {
      return [...PROVIDER_OPTIONS, ...TOP_OPTIONS]
    }
    return TOP_OPTIONS
  }
  return TOP_OPTIONS
}

export const clashCompletionSource = (context: CompletionContext): CompletionResult | null => {
  const word = context.matchBefore(/[A-Za-z][\w-]*/)
  if (!word) return null
  if (word.from === word.to && !context.explicit) return null

  const textBefore = context.state.doc.sliceString(0, word.from)
  return {
    from: word.from,
    to: word.to,
    options: detectSection(textBefore),
    validFor: /^[\w-]*$/,
  }
}
