export function classifyLicensingMx(exchanges: string[]): { ready: boolean; detail: string } {
  const hosts = exchanges.map((host) => host.toLowerCase().replace(/\.$/, ''))
  if (hosts.some((host) => host.includes('resend.com'))) {
    return {
      ready: true,
      detail: 'MX points at Resend, so replies to licensing@sergikdropz.com can be received into the mail desk.',
    }
  }
  if (hosts.length === 0) {
    return {
      ready: false,
      detail:
        'sergikdropz.com has no MX record. Replies to licensing@sergikdropz.com are not delivered. Turn on Receiving for that domain in the Resend dashboard. The send-only API key cannot do that.',
    }
  }
  return {
    ready: false,
    detail: `Mail for sergikdropz.com stays at ${hosts.join(', ')}. Replies to licensing messages go to the owner inbox, so this MX record stays as it is.`,
  }
}
