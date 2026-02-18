export type ApiUser = {
  id: string;
  email: string;
  name?: string | null;
  currency?: string | null;
  locale?: string | null;
  monthlyIncome?: number | null;
  createdAt: string;
  updatedAt: string;
};
