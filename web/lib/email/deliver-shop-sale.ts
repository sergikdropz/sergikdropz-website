import { createSupabaseServerClient } from '@/lib/supabase'
import { departmentMailPlain, departmentPlainTextHtml } from '@/lib/email/departments'
import { isMissingDepartmentMailTable } from '@/lib/email/department-mailbox-store'
import { resolveMailAccount } from '@/lib/email/mail-accounts'
import { sendDepartmentEmail } from '@/lib/email/send-department'
import {
  shopBuyerDownloadNotice,
  shopOrderDownloadUrl,
  shopSaleNotice,
  shopSaleNotifyAddress,
  type ShopSaleInput,
} from '@/lib/email/shop-sale-notice'

const TABLE = 'department_mail_messages'

type FileResult = 'filed' | 'duplicate' | 'unavailable'

async function fileShopSale(input: {
  inboundId: string | null
  folder: 'inbox' | 'sent'
  direction: 'in' | 'out'
  fromAddress: string
  fromName: string
  to: string
  subject: string
  body: string
  status: string
  unread: boolean
  resendId?: string | null
  errorMessage?: string | null
}): Promise<FileResult> {
  try {
    const supabase = createSupabaseServerClient()
    const now = new Date().toISOString()
    const { error } = await supabase.from(TABLE).insert({
      account_id: 'shop',
      folder: input.folder,
      direction: input.direction,
      from_address: input.fromAddress,
      from_name: input.fromName,
      to_addresses: input.to,
      subject: input.subject.slice(0, 200),
      body: input.body.slice(0, 20000),
      status: input.status,
      unread: input.unread,
      resend_id: input.resendId || null,
      inbound_id: input.inboundId,
      error_message: input.errorMessage || null,
      attachments: [],
      created_at: now,
      updated_at: now,
    })
    if (!error) return 'filed'
    if (isMissingDepartmentMailTable(error)) return 'unavailable'
    if (error.code === '23505') return 'duplicate'
    throw new Error(error.message)
  } catch (error) {
    if (isMissingDepartmentMailTable(error as { message?: string })) return 'unavailable'
    throw error
  }
}

async function buyerDownloadAlreadySent(buyerEmail: string, downloadUrl: string): Promise<boolean> {
  try {
    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase
      .from(TABLE)
      .select('id')
      .eq('account_id', 'shop')
      .eq('folder', 'sent')
      .eq('to_addresses', buyerEmail)
      .ilike('body', `%${downloadUrl}%`)
      .limit(1)
    if (error) return false
    return (data || []).length > 0
  } catch {
    return false
  }
}

async function sendBuyerDownload(input: {
  account: { address: string; name: string }
  buyerEmail: string
  title: string
  format?: string | null
  downloadUrl: string
}) {
  if (await buyerDownloadAlreadySent(input.buyerEmail, input.downloadUrl)) return
  const receipt = shopBuyerDownloadNotice({
    title: input.title,
    format: input.format,
    downloadUrl: input.downloadUrl,
  })
  const sent = await sendDepartmentEmail({
    department: 'shop',
    to: input.buyerEmail,
    subject: receipt.subject,
    html: departmentPlainTextHtml(input.account, receipt.body),
    text: departmentMailPlain(receipt.body),
    tags: [{ name: 'source', value: 'shop_download' }],
  })
  await fileShopSale({
    inboundId: null,
    folder: 'sent',
    direction: 'out',
    fromAddress: input.account.address,
    fromName: input.account.name,
    to: input.buyerEmail,
    subject: receipt.subject,
    body: receipt.body,
    status: 'sent',
    unread: false,
    resendId: sent.messageId ?? null,
  }).catch((error) => {
    console.error('Buyer download copy skipped:', error)
  })
}

/** Email the owner from the shop mailbox and file the order in that inbox. */
export async function deliverShopSaleNotice(input: ShopSaleInput): Promise<'sent' | 'duplicate' | 'failed'> {
  const sessionId = input.sessionId.trim()
  if (!sessionId) return 'failed'
  const account = await resolveMailAccount('shop')
  if (!account) return 'failed'

  const origin = (process.env.NEXT_PUBLIC_SITE_URL || 'https://sergikdropz.com').trim()
  const downloadUrl = shopOrderDownloadUrl({
    origin,
    sessionId,
    productType: input.productType,
  })
  const notice = shopSaleNotice({ ...input, downloadUrl })
  const owner = shopSaleNotifyAddress()
  const buyerEmail = String(input.customerEmail || '').trim()
  const buyerName = String(input.customerName || '').trim()
  const inboundId = `sale:${sessionId}`

  const filed = await fileShopSale({
    inboundId,
    folder: 'inbox',
    direction: 'in',
    fromAddress: buyerEmail || account.address,
    fromName: buyerName || 'Shop checkout',
    to: account.address,
    subject: notice.subject,
    body: notice.body,
    status: 'received',
    unread: true,
  })
  if (filed === 'duplicate') {
    if (downloadUrl && buyerEmail) {
      try {
        await sendBuyerDownload({
          account,
          buyerEmail,
          title: input.title,
          format: input.format,
          downloadUrl,
        })
      } catch (error) {
        console.error('Buyer download email failed:', error instanceof Error ? error.message : error)
      }
    }
    return 'duplicate'
  }

  let resendId: string | null = null
  let errorMessage: string | null = null
  try {
    const sent = await sendDepartmentEmail({
      department: 'shop',
      to: owner,
      subject: notice.subject,
      html: departmentPlainTextHtml(account, notice.body),
      text: departmentMailPlain(notice.body),
      tags: [{ name: 'source', value: 'shop_sale' }],
    })
    resendId = sent.messageId ?? null
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : 'Send failed'
    console.error('Shop sale email failed:', errorMessage)
  }

  await fileShopSale({
    inboundId: null,
    folder: 'sent',
    direction: 'out',
    fromAddress: account.address,
    fromName: account.name,
    to: owner,
    subject: notice.subject,
    body: notice.body,
    status: errorMessage ? 'failed' : 'sent',
    unread: false,
    resendId,
    errorMessage,
  }).catch((error) => {
    console.error('Shop sale sent copy skipped:', error)
  })

  if (downloadUrl && buyerEmail && !errorMessage) {
    try {
      await sendBuyerDownload({
        account,
        buyerEmail,
        title: input.title,
        format: input.format,
        downloadUrl,
      })
    } catch (error) {
      console.error('Buyer download email failed:', error instanceof Error ? error.message : error)
    }
  }

  return errorMessage ? 'failed' : 'sent'
}
