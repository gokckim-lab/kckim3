import { supabase } from './supabaseClient';

const BASE_URL = (import.meta.env.VITE_BACKEND_URL as string | undefined) || 'http://localhost:3001';

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('로그인이 필요합니다.');
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function handle(res: Response) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `요청 실패 (${res.status})`);
  return body;
}

export async function getPopbillBalance(): Promise<number> {
  const headers = await authHeaders();
  const res = await fetch(`${BASE_URL}/api/popbill/taxinvoice/balance`, { headers });
  const body = await handle(res);
  return body.balance;
}

export interface IssueResult {
  ok: true;
  ntsConfirmNum: string;
  code: number;
  message: string;
  walletBalance: number;
  emailSent: boolean;
  emailError?: string;
  supplierEmailSent: boolean;
  supplierEmailError?: string;
}

export async function issueTaxInvoice(documentId: string): Promise<IssueResult> {
  const headers = await authHeaders();
  const res = await fetch(`${BASE_URL}/api/popbill/taxinvoice/issue`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ documentId }),
  });
  return handle(res);
}

export async function resendTaxInvoiceEmail(documentId: string, email?: string) {
  const headers = await authHeaders();
  const res = await fetch(`${BASE_URL}/api/popbill/taxinvoice/${documentId}/resend-email`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email }),
  });
  return handle(res);
}

export async function cancelTaxInvoice(documentId: string, memo?: string) {
  const headers = await authHeaders();
  const res = await fetch(`${BASE_URL}/api/popbill/taxinvoice/${documentId}/cancel`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ memo }),
  });
  return handle(res);
}

export async function getTaxInvoicePopupUrl(documentId: string): Promise<string> {
  const headers = await authHeaders();
  const res = await fetch(`${BASE_URL}/api/popbill/taxinvoice/${documentId}/popup-url`, { headers });
  const body = await handle(res);
  return body.url;
}

export async function sendContactMessage(subject: string, message: string) {
  const headers = await authHeaders();
  const res = await fetch(`${BASE_URL}/api/contact`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ subject, message }),
  });
  return handle(res);
}

const postPublic = (path: string, body: unknown) =>
  fetch(`${BASE_URL}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(handle);

export function requestPasswordReset(email: string) {
  return postPublic('/api/account/password-reset', { email });
}

export interface FoundAccount { email: string; google: boolean; createdAt: string }

export async function findEmailByBizNo(bizNo: string): Promise<FoundAccount[]> {
  const body = await postPublic('/api/account/find-email', { bizNo });
  return body.accounts;
}

export async function deleteAccount() {
  const headers = await authHeaders();
  const res = await fetch(`${BASE_URL}/api/account`, {
    method: 'DELETE',
    headers,
  });
  return handle(res);
}
