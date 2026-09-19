export type WalletTxType = 'deposit_request' | 'issue_deduct' | 'refund' | 'refund_request';
export type WalletTxStatus = 'pending' | 'approved' | 'rejected';

export interface WalletTransaction {
  id: string;
  owner_id: string;
  type: WalletTxType;
  amount: number;
  status: WalletTxStatus;
  depositor_name: string;
  refund_account_info: string;
  memo: string;
  related_document_id: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
}

export interface Wallet {
  owner_id: string;
  balance: number;
  updated_at: string;
}
