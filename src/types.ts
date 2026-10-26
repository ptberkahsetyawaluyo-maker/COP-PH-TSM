export interface AdditionalExpense {
  id: string;
  name: string;
  amount: number;
}

export interface COPReportData {
  // Period
  startDate: string;
  endDate: string;
  picName: string;

  // Income
  totalCOP: number;
  transfer: number;
  dusCash: number;

  // Mandatory Expenses
  feederPH: number;
  feederCiamis: number;
  etoll: number;
  bensinVan: number;
  parkir: number;

  // Additional Expenses
  additionalExpenses: AdditionalExpense[];

  // Previous Balance
  prevStartDate: string;
  prevEndDate: string;
  prevSisaSetoran: number;

  // Deposit
  totalSetor: number;
  danaTidakTersetor: number;
  keteranganDana: string;
  keteranganSisaSetoran?: string;
}

export interface HistoryItem extends COPReportData {
  id: string;
  createdAt: string;
  updatedAt?: string;
  totalSisa: number;
  totalCashBersih: number;
  sisaSetorBaru: number;
  totalPengeluaran: number;
}
