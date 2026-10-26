/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useRef, useEffect } from "react";
import { 
  Plus, 
  Trash2, 
  Download, 
  Copy, 
  FileText, 
  Calculator, 
  User as UserIcon, 
  Calendar, 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  History,
  ChevronLeft,
  ChevronRight,
  Save,
  Loader2,
  Printer
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { format, addDays } from "date-fns";
import { id } from "date-fns/locale";
import html2canvas from "html2canvas";
import { cn, formatRupiah } from "./lib/utils";
import type { COPReportData, AdditionalExpense, HistoryItem } from "./types";
import { 
  db, 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  onSnapshot, 
  deleteDoc, 
  doc,
  setDoc
} from "./firebase";

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default function App() {
  const initialData: COPReportData = {
    startDate: "",
    endDate: "",
    picName: "",
    totalCOP: 0,
    transfer: 0,
    dusCash: 0,
    feederPH: 0,
    feederCiamis: 0,
    etoll: 0,
    bensinVan: 0,
    parkir: 0,
    additionalExpenses: [],
    prevStartDate: "",
    prevEndDate: "",
    prevSisaSetoran: 0,
    totalSetor: 0,
    danaTidakTersetor: 0,
    keteranganDana: "",
  };

  const [data, setData] = useState<COPReportData>(initialData);

  const [showAdditionalModal, setShowAdditionalModal] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [editingHistoryId, setEditingHistoryId] = useState<string | null>(null);
  const [newExpense, setNewExpense] = useState({ name: "", amount: 0 });
  const [activeTab, setActiveTab] = useState<"input" | "report" | "history">("input");
  const [isExporting, setIsExporting] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [reportImage, setReportImage] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [reportData, setReportData] = useState<COPReportData>(initialData);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const itemsPerPage = 8;
  const reportRef = useRef<HTMLDivElement>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Global click listener for notifications - REMOVED per user request
  /*
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const button = target.closest('button');
      const link = target.closest('a');
      const input = target.closest('input');
      const label = target.closest('label');
      
      let actionText = "";
      if (button) {
        actionText = `Tombol: ${button.innerText?.trim() || "Tanpa Nama"}`;
      } else if (link) {
        actionText = `Link: ${link.innerText?.trim() || link.getAttribute('href') || "Tautan"}`;
      } else if (input) {
        actionText = `Input: ${input.placeholder || input.name || "Field"}`;
      } else if (label) {
        actionText = `Label: ${label.innerText?.trim()}`;
      } else {
        const text = target.innerText?.trim()?.substring(0, 15);
        actionText = text ? `Klik: ${text}...` : `Klik: ${target.tagName.toLowerCase()}`;
      }
      
      if (actionText) {
        showToast(actionText, 'info');
      }
    };
    window.addEventListener('click', handleClick, true);
    return () => window.removeEventListener('click', handleClick, true);
  }, []);
  */

  // Load history from Firestore
  useEffect(() => {
    const path = "history";
    const q = query(
      collection(db, path),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      })) as HistoryItem[];
      setHistory(items);
      if (items.length > 0) {
        const latestItem = items[0];
        setData(prev => {
          // Only auto-fill if the user hasn't manually changed it, or if it's empty
          // We assume if it matches the latest item's startDate, it was auto-filled previously.
          const isAutoFilled = prev.prevStartDate === "" || prev.prevStartDate === latestItem.startDate;
          
          if (isAutoFilled) {
            return { 
              ...prev, 
              prevSisaSetoran: latestItem.totalSisa,
              prevStartDate: latestItem.startDate,
              prevEndDate: latestItem.endDate
            };
          }
          return prev;
        });
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    });

    return () => unsubscribe();
  }, []);

  // No login/logout logic needed

  // Calculations
  const cashAwal = useMemo(() => data.totalCOP - data.transfer + data.dusCash, [data.totalCOP, data.transfer, data.dusCash]);
  
  const totalAdditionalExpenses = useMemo(() => 
    data.additionalExpenses.reduce((sum, exp) => sum + exp.amount, 0), 
    [data.additionalExpenses]
  );

  const totalMandatoryExpenses = useMemo(() => 
    data.feederPH + data.feederCiamis + data.etoll + data.bensinVan + data.parkir,
    [data.feederPH, data.feederCiamis, data.etoll, data.bensinVan, data.parkir]
  );

  const totalPengeluaran = useMemo(() => 
    totalMandatoryExpenses + totalAdditionalExpenses,
    [totalMandatoryExpenses, totalAdditionalExpenses]
  );

  const totalCashBersih = useMemo(() => data.prevSisaSetoran + (cashAwal - totalPengeluaran), [data.prevSisaSetoran, cashAwal, totalPengeluaran]);
  
  const sisaSetorBaru = useMemo(() => (cashAwal - totalPengeluaran) - data.totalSetor, [cashAwal, totalPengeluaran, data.totalSetor]);
  
  const totalSisa = useMemo(() => data.prevSisaSetoran + sisaSetorBaru, [data.prevSisaSetoran, sisaSetorBaru]);

  const handleInputChange = (field: keyof COPReportData, value: any) => {
    setData(prev => ({ ...prev, [field]: value }));
  };

  const saveAdditionalExpense = () => {
    if (newExpense.name && newExpense.amount > 0) {
      if (editingExpenseId) {
        setData(prev => ({
          ...prev,
          additionalExpenses: prev.additionalExpenses.map(exp => 
            exp.id === editingExpenseId ? { ...exp, name: newExpense.name, amount: newExpense.amount } : exp
          ),
        }));
      } else {
        const expense: AdditionalExpense = {
          id: Math.random().toString(36).substring(7),
          name: newExpense.name,
          amount: newExpense.amount,
        };
        setData(prev => ({
          ...prev,
          additionalExpenses: [...prev.additionalExpenses, expense],
        }));
      }
      setNewExpense({ name: "", amount: 0 });
      setEditingExpenseId(null);
      setShowAdditionalModal(false);
    }
  };

  const openEditModal = (expense: AdditionalExpense) => {
    setNewExpense({ name: expense.name, amount: expense.amount });
    setEditingExpenseId(expense.id);
    setShowAdditionalModal(true);
  };

  const openAddModal = () => {
    setNewExpense({ name: "", amount: 0 });
    setEditingExpenseId(null);
    setShowAdditionalModal(true);
  };

  const removeAdditionalExpense = (id: string) => {
    setData(prev => ({
      ...prev,
      additionalExpenses: prev.additionalExpenses.filter(exp => exp.id !== id),
    }));
  };

  const downloadAsImage = async () => {
    if (!reportRef.current || !reportData || isExporting) return;
    
    setIsExporting(true);
    showToast("Memproses Gambar...", "info");
    
    try {
      // Tunggu sebentar agar rendering selesai
      await new Promise(resolve => setTimeout(resolve, 800));

      const element = reportRef.current;
      const canvas = await html2canvas(element, {
        scale: 2, // Gunakan scale 2 agar tidak terlalu berat tapi tetap tajam
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
        imageTimeout: 15000,
        scrollX: 0,
        scrollY: 0,
        onclone: (clonedDoc) => {
          const clonedElement = clonedDoc.getElementById('report-to-export') as HTMLElement;
          if (clonedElement) {
            // 1. Paksa ukuran tetap untuk hasil konsisten
            clonedElement.style.width = '650px';
            clonedElement.style.maxHeight = 'none';
            clonedElement.style.overflow = 'visible';
            clonedElement.style.margin = '0';
            clonedElement.style.borderRadius = '0';
            clonedElement.style.boxShadow = 'none'; // Shadow sering bikin error/glitch

            // 2. Tambahkan style override untuk memperbaiki warna oklch (Tailwind v4)
            // html2canvas tidak mendukung oklch, jadi kita paksa ke HEX/RGB
            const style = clonedDoc.createElement('style');
            style.innerHTML = `
              #report-to-export { background-color: #ffffff !important; color: #1e293b !important; }
              .bg-blue-700 { background-color: #1d4ed8 !important; }
              .bg-blue-50 { background-color: #eff6ff !important; }
              .bg-emerald-600 { background-color: #059669 !important; }
              .bg-rose-600 { background-color: #e11d48 !important; }
              .bg-slate-50 { background-color: #f8fafc !important; }
              .text-blue-700 { color: #1d4ed8 !important; }
              .text-blue-600 { color: #2563eb !important; }
              .text-blue-500 { color: #3b82f6 !important; }
              .text-blue-200 { color: #bfdbfe !important; }
              .text-blue-100 { color: #dbeafe !important; }
              .text-emerald-600 { color: #059669 !important; }
              .text-rose-600 { color: #e11d48 !important; }
              .text-slate-700 { color: #334155 !important; }
              .text-slate-600 { color: #475569 !important; }
              .text-slate-500 { color: #64748b !important; }
              .text-slate-400 { color: #94a3b8 !important; }
              .border-blue-50 { border-color: #eff6ff !important; }
              .border-blue-100 { border-color: #dbeafe !important; }
              .border-rose-50 { border-color: #fff1f2 !important; }
              .border-slate-50 { border-color: #f8fafc !important; }
              .border-slate-100 { border-color: #f1f5f9 !important; }
              .border-slate-200 { border-color: #e2e8f0 !important; }
              * { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
            `;
            clonedDoc.head.appendChild(style);
          }
        }
      });
      
      const imgData = canvas.toDataURL("image/png", 1.0);
      if (imgData && imgData !== "data:,") {
        const link = document.createElement('a');
        link.download = `Laporan_COP_${reportData.startDate || 'report'}.png`;
        link.href = imgData;
        link.click();
        showToast("Gambar Berhasil Diunduh!", "success");
      } else {
        throw new Error("Canvas kosong atau tidak valid");
      }
    } catch (error) {
      console.error("Download image failed:", error);
      showToast("Gagal mengunduh gambar. Silakan coba lagi.", "error");
    } finally {
      setIsExporting(false);
    }
  };

  const previewAsImage = async () => {
    if (!reportRef.current || !reportData || isExporting) return;
    
    setIsExporting(true);
    showToast("Memproses Pratinjau...", "info");
    
    try {
      await new Promise(resolve => setTimeout(resolve, 800));

      const element = reportRef.current;
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
        imageTimeout: 15000,
        scrollX: 0,
        scrollY: 0,
        onclone: (clonedDoc) => {
          // Remove oklch and oklab colors from cloned styles to fix html2canvas parsing error
          clonedDoc.querySelectorAll('style').forEach(style => {
            style.innerHTML = style.innerHTML.replace(/oklch\([^)]+\)/g, 'transparent').replace(/oklab\([^)]+\)/g, 'transparent');
          });
          clonedDoc.querySelectorAll('*').forEach(el => {
            if (el.getAttribute('style')) {
              el.setAttribute('style', el.getAttribute('style')!.replace(/oklch\([^)]+\)/g, 'transparent').replace(/oklab\([^)]+\)/g, 'transparent'));
            }
          });

          const clonedElement = clonedDoc.getElementById('report-to-export') as HTMLElement;
          if (clonedElement) {
            clonedElement.style.width = '650px';
            clonedElement.style.maxHeight = 'none';
            clonedElement.style.overflow = 'visible';
            clonedElement.style.margin = '0';
            clonedElement.style.borderRadius = '0';
            clonedElement.style.boxShadow = 'none';

            const style = clonedDoc.createElement('style');
            style.innerHTML = `
              #report-to-export { background-color: #ffffff !important; color: #1e293b !important; }
              .bg-blue-700 { background-color: #1d4ed8 !important; }
              .bg-blue-50 { background-color: #eff6ff !important; }
              .bg-emerald-600 { background-color: #059669 !important; }
              .bg-rose-600 { background-color: #e11d48 !important; }
              .bg-rose-700 { background-color: #be123c !important; }
              .bg-slate-50 { background-color: #f8fafc !important; }
              .bg-slate-900 { background-color: #0f172a !important; }
              .text-blue-700 { color: #1d4ed8 !important; }
              .text-blue-600 { color: #2563eb !important; }
              .text-blue-500 { color: #3b82f6 !important; }
              .text-blue-200 { color: #bfdbfe !important; }
              .text-blue-100 { color: #dbeafe !important; }
              .text-emerald-600 { color: #059669 !important; }
              .text-emerald-50 { color: #ecfdf5 !important; }
              .text-rose-600 { color: #e11d48 !important; }
              .text-rose-200 { color: #fecdd3 !important; }
              .text-slate-700 { color: #334155 !important; }
              .text-slate-600 { color: #475569 !important; }
              .text-slate-500 { color: #64748b !important; }
              .text-slate-400 { color: #94a3b8 !important; }
              .border-blue-50 { border-color: #eff6ff !important; }
              .border-blue-100 { border-color: #dbeafe !important; }
              .border-rose-50 { border-color: #fff1f2 !important; }
              .border-slate-50 { border-color: #f8fafc !important; }
              .border-slate-100 { border-color: #f1f5f9 !important; }
              .border-slate-200 { border-color: #e2e8f0 !important; }
              .border-indigo-100 { border-color: #e0e7ff !important; }
            `;
            clonedDoc.head.appendChild(style);
          }
        }
      });
      
      const imgData = canvas.toDataURL("image/png", 1.0);
      if (imgData && imgData !== "data:,") {
        setReportImage(imgData);
        setShowImageModal(true);
        showToast("Pratinjau Siap!", "success");
      } else {
        throw new Error("Canvas kosong");
      }
    } catch (error) {
      console.error("Preview image failed:", error);
      showToast("Gagal memuat pratinjau.", "error");
    } finally {
      setIsExporting(false);
    }
  };

  const copyToClipboard = () => {
    if (!reportData) return;

    const rCashAwal = reportData.totalCOP - reportData.transfer + reportData.dusCash;
    const rTotalMandatory = reportData.feederPH + reportData.feederCiamis + reportData.etoll + reportData.bensinVan + reportData.parkir;
    const rTotalAdditional = reportData.additionalExpenses.reduce((sum, exp) => sum + exp.amount, 0);
    const rTotalPengeluaran = rTotalMandatory + rTotalAdditional;
    const rTotalCashBersih = reportData.prevSisaSetoran + (rCashAwal - rTotalPengeluaran);
    const rSisaSetorBaru = (rCashAwal - rTotalPengeluaran) - reportData.totalSetor;
    const rTotalSisa = reportData.prevSisaSetoran + rSisaSetorBaru;

    const formattedReport = `
*SETOR COP PAXEL HOME TASIKMALAYA*
*PT BERKAH SETYA WALUYO*

*Periode:* ${reportData.startDate && reportData.endDate ? `${format(new Date(reportData.startDate), "dd MMM yyyy", { locale: id })} - ${format(new Date(reportData.endDate), "dd MMM yyyy", { locale: id })}` : "-"}
*PIC:* ${reportData.picName || "-"}

*PEMASUKAN:*

Total COP: ${formatRupiah(reportData.totalCOP)}
Transfer: ${formatRupiah(reportData.transfer)}
Dus Cash: ${formatRupiah(reportData.dusCash)}
Cash Awal: ${formatRupiah(rCashAwal)}

*PENGELUARAN:*

${reportData.feederPH > 0 ? `Feeder PH: ${formatRupiah(reportData.feederPH)}\n` : ""}${reportData.feederCiamis > 0 ? `Feeder Ciamis: ${formatRupiah(reportData.feederCiamis)}\n` : ""}${reportData.etoll > 0 ? `Etoll: ${formatRupiah(reportData.etoll)}\n` : ""}${reportData.bensinVan > 0 ? `Bensin Van: ${formatRupiah(reportData.bensinVan)}\n` : ""}${reportData.parkir > 0 ? `Parkir: ${formatRupiah(reportData.parkir)}\n` : ""}${reportData.additionalExpenses.map(exp => `${exp.name}: ${formatRupiah(exp.amount)}`).join('\n')}${reportData.additionalExpenses.length > 0 ? '\n' : ''}Total Pengeluaran: ${formatRupiah(rTotalPengeluaran)}

*SISA SETOR SEBELUMNYA:*

Periode: ${reportData.prevStartDate && reportData.prevEndDate ? `${format(new Date(reportData.prevStartDate), "dd MMM", { locale: id })} - ${format(new Date(reportData.prevEndDate), "dd MMM yyyy", { locale: id })}` : "-"}
Jumlah: ${formatRupiah(reportData.prevSisaSetoran)}

*HASIL AKHIR:*

Total Uang Cash: ${formatRupiah(rTotalCashBersih)}
Total Setor: ${formatRupiah(reportData.totalSetor)}
Sisa Setoran: ${formatRupiah(rTotalSisa)}
${reportData.danaTidakTersetor > 0 ? `
*Dana Tidak Tersetor:* ${formatRupiah(reportData.danaTidakTersetor)} _(${reportData.keteranganDana || ""})_
*Total Tidak Tersetor:* ${formatRupiah(reportData.danaTidakTersetor + rTotalSisa)}
*Total Uang Ter Setor:* ${formatRupiah(reportData.totalSetor - reportData.danaTidakTersetor)}` : ""}
    `.trim();

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(formattedReport).then(() => {
        showToast("Laporan berhasil disalin ke clipboard!", "success");
      }).catch(err => {
        console.error('Failed to copy: ', err);
        showToast("Gagal menyalin laporan.", "error");
      });
    } else {
      // Fallback for older browsers
      const textArea = document.createElement("textarea");
      textArea.value = formattedReport;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        showToast("Laporan berhasil disalin ke clipboard!", "success");
      } catch (err) {
        showToast("Gagal menyalin laporan.", "error");
      }
      document.body.removeChild(textArea);
    }
  };

  const generateReport = () => {
    try {
      if (!data.startDate || !data.endDate || !data.picName) {
        showToast("Harap lengkapi Periode dan PIC Laporan!", "error");
        return;
      }

      // Capture current data for report view
      setReportData({ ...data });

      // Switch to report tab
      setActiveTab("report");

      // Automatic carry-over for NEXT input ONLY IF NOT EDITING
      if (!editingHistoryId) {
        const nextStartDate = format(addDays(new Date(data.endDate), 1), "yyyy-MM-dd");
        const nextEndDate = format(addDays(new Date(data.endDate), 7), "yyyy-MM-dd");

        setData(prev => ({
          ...prev,
          startDate: nextStartDate,
          endDate: nextEndDate,
          totalCOP: 0,
          transfer: 0,
          dusCash: 0,
          feederPH: 0,
          feederCiamis: 0,
          etoll: 0,
          bensinVan: 0,
          parkir: 0,
          additionalExpenses: [],
          prevStartDate: data.startDate,
          prevEndDate: data.endDate,
          prevSisaSetoran: data.danaTidakTersetor > 0 ? (data.danaTidakTersetor + totalSisa) : totalSisa,
          totalSetor: 0,
          danaTidakTersetor: 0,
          keteranganDana: "",
        }));
      }
    } catch (error: any) {
      showToast("Error generating report: " + error.message, "error");
      console.error(error);
    }
  };

  const saveReport = async () => {
    if (!reportData) return;

    // Recalculate values for reportData
    const rCashAwal = reportData.totalCOP - reportData.transfer + reportData.dusCash;
    const rTotalMandatory = reportData.feederPH + reportData.feederCiamis + reportData.etoll + reportData.bensinVan + reportData.parkir;
    const rTotalAdditional = reportData.additionalExpenses.reduce((sum, exp) => sum + exp.amount, 0);
    const rTotalPengeluaran = rTotalMandatory + rTotalAdditional;
    const rTotalCashBersih = reportData.prevSisaSetoran + (rCashAwal - rTotalPengeluaran);
    const rSisaSetorBaru = (rCashAwal - rTotalPengeluaran) - reportData.totalSetor;
    const rTotalSisa = reportData.prevSisaSetoran + rSisaSetorBaru;

    const path = "history";
    try {
      const newHistoryItem = {
        ...reportData,
        updatedAt: new Date().toISOString(),
        totalSisa: rTotalSisa,
        totalCashBersih: rTotalCashBersih,
        sisaSetorBaru: rSisaSetorBaru,
        totalPengeluaran: rTotalPengeluaran,
      };

      if (editingHistoryId) {
        await setDoc(doc(db, path, editingHistoryId), newHistoryItem, { merge: true });
        showToast("Laporan berhasil diperbarui!", "success");
        setEditingHistoryId(null);
        setData(initialData);
      } else {
        await addDoc(collection(db, path), {
          ...newHistoryItem,
          createdAt: new Date().toISOString(),
        });
        showToast("Laporan berhasil disimpan ke riwayat!", "success");
      }
      
      setActiveTab("history");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  };

  const deleteHistoryItem = async (id: string) => {
    const path = `history/${id}`;
    try {
      await deleteDoc(doc(db, "history", id));
      showToast("Laporan berhasil dihapus!", "success");
      setItemToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const deleteAllHistory = async () => {
    if (!window.confirm("Apakah Anda yakin ingin menghapus seluruh riwayat?")) return;
    
    try {
      for (const item of history) {
        await deleteDoc(doc(db, "history", item.id));
      }
      setHistory([]);
      showToast("Seluruh riwayat berhasil dihapus!", "success");
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, "history");
    }
  };

  const loadHistoryItem = (item: HistoryItem) => {
    let prevStartDate = item.prevStartDate || "";
    let prevEndDate = item.prevEndDate || "";
    let prevSisaSetoran = item.prevSisaSetoran || 0;

    // If missing, try to find the previous report in history to auto-fill
    if (!prevStartDate && history.length > 0) {
      const currentIndex = history.findIndex(h => h.id === item.id);
      if (currentIndex >= 0 && currentIndex + 1 < history.length) {
        const previousItem = history[currentIndex + 1];
        prevStartDate = previousItem.startDate;
        prevEndDate = previousItem.endDate;
        prevSisaSetoran = previousItem.totalSisa;
      }
    }

    const historyData: COPReportData = {
      startDate: item.startDate,
      endDate: item.endDate,
      picName: item.picName,
      totalCOP: item.totalCOP,
      transfer: item.transfer,
      dusCash: item.dusCash,
      feederPH: item.feederPH,
      feederCiamis: item.feederCiamis,
      etoll: item.etoll,
      bensinVan: item.bensinVan,
      parkir: item.parkir,
      additionalExpenses: item.additionalExpenses || [],
      prevStartDate,
      prevEndDate,
      prevSisaSetoran,
      totalSetor: item.totalSetor || 0,
      danaTidakTersetor: item.danaTidakTersetor || 0,
      keteranganDana: item.keteranganDana || "",
    };
    setReportData(historyData);
    setEditingHistoryId(item.id);
    setActiveTab("report");
  };

  const paginatedHistory = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return history.slice(start, start + itemsPerPage);
  }, [history, currentPage]);

  const totalPages = Math.ceil(history.length / itemsPerPage);

  const reportTotalSisa = reportData.prevSisaSetoran + ((reportData.totalCOP - reportData.transfer + reportData.dusCash) - (
    reportData.feederPH + reportData.feederCiamis + reportData.etoll + reportData.bensinVan + reportData.parkir + 
    reportData.additionalExpenses.reduce((sum, exp) => sum + exp.amount, 0)
  )) - reportData.totalSetor;

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-12">
      {/* Header */}
      <header className="bg-blue-700 text-white shadow-lg sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="hidden sm:block">
              <h1 className="text-xl font-bold tracking-tight">PT Berkah Setya Waluyo</h1>
              <p className="text-blue-100 text-xs font-medium">Aplikasi Laporan COP Mingguan</p>
            </div>
            <div className="sm:hidden">
              <h1 className="text-lg font-bold tracking-tight">COP App</h1>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex bg-blue-800/50 p-1 rounded-lg">
              <button 
                onClick={() => setActiveTab("input")}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-semibold transition-all",
                  activeTab === "input" ? "bg-white text-blue-700 shadow-sm" : "text-blue-100 hover:text-white"
                )}
              >
                Input
              </button>
              <button 
                onClick={() => setActiveTab("report")}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-semibold transition-all",
                  activeTab === "report" ? "bg-white text-blue-700 shadow-sm" : "text-blue-100 hover:text-white"
                )}
              >
                Laporan
              </button>
              <button 
                onClick={() => setActiveTab("history")}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-semibold transition-all",
                  activeTab === "history" ? "bg-white text-blue-700 shadow-sm" : "text-blue-100 hover:text-white"
                )}
              >
                Riwayat
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        <AnimatePresence mode="wait">
          {activeTab === "input" ? (
            <motion.div 
              key="input-tab"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              {/* Periode & PIC */}
              <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 px-6 py-3 border-b border-slate-200 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-blue-600" />
                  <h2 className="font-bold text-slate-700 uppercase tracking-wider text-xs">Periode & PIC</h2>
                </div>
                <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500 uppercase">Tanggal Mulai</label>
                    <input 
                      type="date" 
                      value={data.startDate}
                      onChange={(e) => handleInputChange("startDate", e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500 uppercase">Tanggal Akhir</label>
                    <input 
                      type="date" 
                      value={data.endDate}
                      onChange={(e) => handleInputChange("endDate", e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500 uppercase">PIC Laporan</label>
                    <div className="relative">
                      <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <select 
                        value={data.picName}
                        onChange={(e) => handleInputChange("picName", e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white"
                      >
                        <option value="">Pilih PIC</option>
                        <option value="Hanifah Fithriyah">Hanifah Fithriyah</option>
                        <option value="Muhammad Rafi Rahmatulloh">Muhammad Rafi Rahmatulloh</option>
                        <option value="Irwan Maulana">Irwan Maulana</option>
                        <option value="Nurohmat Amin">Nurohmat Amin</option>
                        <option value="Sheta Arsanata">Sheta Arsanata</option>
                      </select>
                    </div>
                  </div>
                </div>
              </section>

              {/* Pemasukan */}
              <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 px-6 py-3 border-b border-slate-200 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-600" />
                  <h2 className="font-bold text-slate-700 uppercase tracking-wider text-xs">Data Pemasukan</h2>
                </div>
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-500 uppercase">Total COP</label>
                      <input 
                        type="number" 
                        value={data.totalCOP || ""}
                        onChange={(e) => handleInputChange("totalCOP", Number(e.target.value))}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-500 uppercase">Transfer</label>
                      <input 
                        type="number" 
                        value={data.transfer || ""}
                        onChange={(e) => handleInputChange("transfer", Number(e.target.value))}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-500 uppercase">Dus Cash</label>
                      <input 
                        type="number" 
                        value={data.dusCash || ""}
                        onChange={(e) => handleInputChange("dusCash", Number(e.target.value))}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                  </div>
                  <div className="bg-emerald-50 rounded-2xl p-6 flex flex-col justify-center items-center text-center border border-emerald-100">
                    <span className="text-xs font-bold text-emerald-600 uppercase tracking-widest mb-1">Cash Awal</span>
                    <span className="text-3xl font-black text-emerald-700">{formatRupiah(cashAwal)}</span>
                    <p className="text-[10px] text-emerald-500 mt-2 font-medium uppercase tracking-tight italic">Otomatis: Total COP - Transfer + Dus Cash</p>
                  </div>
                </div>
              </section>

              {/* Pengeluaran */}
              <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 px-6 py-3 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingDown className="w-4 h-4 text-rose-600" />
                    <h2 className="font-bold text-slate-700 uppercase tracking-wider text-xs">Pengeluaran</h2>
                  </div>
                  <button 
                    onClick={openAddModal}
                    className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-lg text-xs font-bold transition-colors shadow-sm"
                  >
                    <Plus className="w-3 h-3" />
                    Tambah
                  </button>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Wajib</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-500 uppercase">Feeder PH</label>
                          <input 
                            type="number" 
                            value={data.feederPH || ""}
                            onChange={(e) => handleInputChange("feederPH", Number(e.target.value))}
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-500 uppercase">Feeder Ciamis</label>
                          <input 
                            type="number" 
                            value={data.feederCiamis || ""}
                            onChange={(e) => handleInputChange("feederCiamis", Number(e.target.value))}
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-500 uppercase">Etoll</label>
                          <input 
                            type="number" 
                            value={data.etoll || ""}
                            onChange={(e) => handleInputChange("etoll", Number(e.target.value))}
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-500 uppercase">Bensin Van</label>
                          <input 
                            type="number" 
                            value={data.bensinVan || ""}
                            onChange={(e) => handleInputChange("bensinVan", Number(e.target.value))}
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-500 uppercase">Parkir</label>
                          <input 
                            type="number" 
                            value={data.parkir || ""}
                            onChange={(e) => handleInputChange("parkir", Number(e.target.value))}
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Tambahan</h3>
                      <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                        {data.additionalExpenses.length === 0 ? (
                          <div className="text-center py-6 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                            <p className="text-xs text-slate-400 font-medium italic">Belum ada pengeluaran tambahan</p>
                          </div>
                        ) : (
                          data.additionalExpenses.map((exp) => (
                            <div key={exp.id} className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-100 group">
                              <div className="flex flex-col">
                                <span className="text-xs font-bold text-slate-700">{exp.name}</span>
                                <span className="text-[10px] font-medium text-slate-500">{formatRupiah(exp.amount)}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <button 
                                  onClick={() => openEditModal(exp)}
                                  className="text-slate-300 hover:text-blue-500 transition-colors p-1"
                                >
                                  <Plus className="w-4 h-4 rotate-45 scale-75" /> {/* Using Plus as a simple edit icon or we can use Pencil if imported */}
                                </button>
                                <button 
                                  onClick={() => removeAdditionalExpense(exp.id)}
                                  className="text-slate-300 hover:text-rose-500 transition-colors p-1"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-8 pt-6 border-t border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center">
                        <Calculator className="w-5 h-5 text-rose-500" />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Pengeluaran</p>
                        <p className="text-xl font-black text-rose-600">{formatRupiah(totalPengeluaran)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 bg-blue-50 px-6 py-3 rounded-2xl border border-blue-100">
                      <div>
                        <p className="text-[10px] font-bold text-blue-500 uppercase tracking-widest text-right">Total Cash Bersih</p>
                        <p className="text-xl font-black text-blue-700 text-right">{formatRupiah(totalCashBersih)}</p>
                      </div>
                      <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                        <Wallet className="w-5 h-5 text-blue-600" />
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Sisa Sebelumnya & Setoran */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="bg-slate-50 px-6 py-3 border-b border-slate-200 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-amber-600" />
                    <h2 className="font-bold text-slate-700 uppercase tracking-wider text-xs">Sisa Setoran Sebelumnya</h2>
                  </div>
                  <div className="p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Tgl Mulai</label>
                        <input 
                          type="date" 
                          value={data.prevStartDate || ""}
                          onChange={(e) => handleInputChange("prevStartDate", e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Tgl Akhir</label>
                        <input 
                          type="date" 
                          value={data.prevEndDate || ""}
                          onChange={(e) => handleInputChange("prevEndDate", e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Jumlah Sisa Setoran</label>
                      <input 
                        type="number" 
                        value={data.prevSisaSetoran || ""}
                        onChange={(e) => handleInputChange("prevSisaSetoran", Number(e.target.value))}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                  </div>
                </section>

                <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="bg-slate-50 px-6 py-3 border-b border-slate-200 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-blue-600" />
                    <h2 className="font-bold text-slate-700 uppercase tracking-wider text-xs">Data Setoran</h2>
                  </div>
                  <div className="p-6 space-y-6">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Total Setor</label>
                      <input 
                        type="number" 
                        value={data.totalSetor || ""}
                        onChange={(e) => handleInputChange("totalSetor", Number(e.target.value))}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Dana Tidak Tersetor</label>
                      <input 
                        type="number" 
                        value={data.danaTidakTersetor || ""}
                        onChange={(e) => handleInputChange("danaTidakTersetor", Number(e.target.value))}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Keterangan Dana</label>
                      <input 
                        type="text" 
                        value={data.keteranganDana || ""}
                        onChange={(e) => handleInputChange("keteranganDana", e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                    <div className="bg-blue-700 rounded-2xl p-4 text-white shadow-md">
                      <p className="text-[10px] font-bold text-blue-200 uppercase tracking-widest mb-1">Sisa Setoran</p>
                      <p className="text-2xl font-black">{formatRupiah(totalSisa)}</p>
                    </div>
                    <div className="bg-emerald-600 rounded-2xl p-4 text-white shadow-md">
                      <p className="text-[10px] font-bold text-emerald-100 uppercase tracking-widest mb-1">Dana Tidak Tersetor</p>
                      <p className="text-2xl font-black">{formatRupiah(data.danaTidakTersetor)}</p>
                      {data.keteranganDana && (
                        <p className="text-[10px] text-emerald-100 mt-2 italic">* {data.keteranganDana}</p>
                      )}
                    </div>
                    {data.danaTidakTersetor > 0 && (
                      <div className="bg-rose-700 rounded-2xl p-4 text-white shadow-md">
                        <p className="text-[10px] font-bold text-rose-200 uppercase tracking-widest mb-1">Total Tidak Tersetor</p>
                        <p className="text-2xl font-black">{formatRupiah(data.danaTidakTersetor + totalSisa)}</p>
                      </div>
                    )}
                  </div>
                </section>
              </div>

              <div className="flex justify-center pt-4 gap-4">
                {editingHistoryId && (
                  <button 
                    onClick={() => {
                      setEditingHistoryId(null);
                      setData(initialData);
                      showToast("Edit dibatalkan", "info");
                    }}
                    className="flex items-center gap-2 bg-slate-200 hover:bg-slate-300 text-slate-700 px-8 py-4 rounded-2xl font-bold transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0"
                  >
                    Batal Edit
                  </button>
                )}
                <button 
                  onClick={generateReport}
                  className="flex items-center gap-2 bg-blue-700 hover:bg-blue-800 text-white px-8 py-4 rounded-2xl font-bold transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0"
                >
                  <FileText className="w-5 h-5" />
                  {editingHistoryId ? "Lihat Perubahan" : "Generate Laporan"}
                </button>
              </div>
            </motion.div>
          ) : activeTab === "report" ? (
            <motion.div 
              key="report-tab"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="space-y-6"
            >
              <div className="flex flex-wrap gap-3 justify-center mb-4">
                <button 
                  onClick={saveReport}
                  className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm"
                >
                  <Save className="w-4 h-4" />
                  {editingHistoryId ? "Simpan Perubahan" : "Simpan Laporan"}
                </button>
                <button 
                  onClick={copyToClipboard}
                  className="flex items-center gap-2 bg-slate-700 hover:bg-slate-800 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm"
                >
                  <Copy className="w-4 h-4" />
                  Copy Laporan
                </button>
                <button 
                  onClick={() => window.print()}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm"
                >
                  <Printer className="w-4 h-4" />
                  Print Laporan
                </button>
                <button 
                  onClick={() => {
                    setData(reportData);
                    setActiveTab("input");
                  }}
                  className="flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-5 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm"
                >
                  Edit Data
                </button>
              </div>

              {/* Report Canvas */}
              <div id="report-to-export" ref={reportRef} className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden max-w-2xl mx-auto">
                <div className="bg-blue-700 p-8 text-white text-center">
                  <h2 className="text-2xl font-black uppercase tracking-tighter">Setor COP</h2>
                  <h3 className="text-lg font-bold text-blue-200 uppercase tracking-widest">PAXEL HOME TASIKMALAYA</h3>
                  <div className="mt-4 flex flex-col items-center gap-1">
                    <div className="flex items-center gap-2 bg-blue-800/50 px-4 py-1 rounded-full text-xs font-semibold">
                      <Calendar className="w-3 h-3" />
                      <span>{reportData.startDate && reportData.endDate ? `${format(new Date(reportData.startDate), "dd MMM yyyy", { locale: id })} - ${format(new Date(reportData.endDate), "dd MMM yyyy", { locale: id })}` : "-"}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-medium text-blue-100">
                      <UserIcon className="w-3 h-3" />
                      <span>PIC: {reportData.picName || "-"}</span>
                    </div>
                    <div className="mt-2 text-center pt-2 border-t border-blue-600/50 w-full max-w-xs">
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-100">PT Berkah Setya Waluyo</p>
                      <p className="text-[9px] text-blue-200">Designed by Nurohmat Amin, S.M., M.M., CPHRM, M.M</p>
                    </div>
                  </div>
                </div>

                <div className="p-8 space-y-8">
                  {/* Pemasukan Section */}
                  <div className="space-y-4">
                    <h4 className="text-[10px] font-black text-blue-600 uppercase tracking-[0.3em] border-b border-blue-50 pb-2">Data Pemasukan</h4>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-slate-500">Total COP</span>
                        <span className="text-sm font-bold text-slate-700">{formatRupiah(reportData.totalCOP)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-slate-500">Transfer</span>
                        <span className="text-sm font-bold text-slate-700">{formatRupiah(reportData.transfer)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-slate-500">Dus Cash</span>
                        <span className="text-sm font-bold text-slate-700">{formatRupiah(reportData.dusCash)}</span>
                      </div>
                      <div className="flex justify-between items-center pt-2 border-t border-slate-50">
                        <span className="text-sm font-bold text-emerald-600">Cash Awal</span>
                        <span className="text-sm font-black text-emerald-600">{formatRupiah(reportData.totalCOP - reportData.transfer + reportData.dusCash)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Pengeluaran Section */}
                  <div className="space-y-4">
                    <h4 className="text-[10px] font-black text-rose-600 uppercase tracking-[0.3em] border-b border-rose-50 pb-2">Pengeluaran</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500">Feeder PH</span>
                        <span className="font-semibold text-slate-700">{formatRupiah(reportData.feederPH)}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500">Feeder Ciamis</span>
                        <span className="font-semibold text-slate-700">{formatRupiah(reportData.feederCiamis)}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500">Etoll</span>
                        <span className="font-semibold text-slate-700">{formatRupiah(reportData.etoll)}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500">Bensin Van</span>
                        <span className="font-semibold text-slate-700">{formatRupiah(reportData.bensinVan)}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500">Parkir</span>
                        <span className="font-semibold text-slate-700">{formatRupiah(reportData.parkir)}</span>
                      </div>
                      {reportData.additionalExpenses.map(exp => (
                        <div key={exp.id} className="flex justify-between items-center text-xs">
                          <span className="text-slate-500">{exp.name}</span>
                          <span className="font-semibold text-slate-700">{formatRupiah(exp.amount)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between items-center pt-2 border-t border-slate-50">
                        <span className="text-sm font-bold text-rose-600">Total Pengeluaran</span>
                        <span className="text-sm font-black text-rose-600">{formatRupiah(
                          reportData.feederPH + reportData.feederCiamis + reportData.etoll + reportData.bensinVan + reportData.parkir + 
                          reportData.additionalExpenses.reduce((sum, exp) => sum + exp.amount, 0)
                        )}</span>
                      </div>
                    </div>
                  </div>

                  {/* Sisa Sebelumnya Section */}
                  <div className="bg-slate-50 rounded-2xl p-5 space-y-3 border border-slate-100">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Sisa Setor Sebelumnya</h4>
                    <div className="flex justify-between items-center">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-medium text-slate-400">Periode</span>
                        <span className="text-xs font-bold text-slate-600">
                          {reportData.prevStartDate && reportData.prevEndDate ? `${format(new Date(reportData.prevStartDate), "dd MMM", { locale: id })} - ${format(new Date(reportData.prevEndDate), "dd MMM yyyy", { locale: id })}` : "-"}
                        </span>
                      </div>
                      <span className="text-lg font-black text-slate-700">{formatRupiah(reportData.prevSisaSetoran)}</span>
                    </div>
                  </div>

                  {/* Summary Section */}
                  <div className="space-y-4 pt-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100">
                        <span className="text-[10px] font-bold text-blue-500 uppercase tracking-widest block mb-1">Total Uang Cash</span>
                        <span className="text-lg font-black text-blue-700">
                          {formatRupiah(reportData.prevSisaSetoran + ((reportData.totalCOP - reportData.transfer + reportData.dusCash) - (
                            reportData.feederPH + reportData.feederCiamis + reportData.etoll + reportData.bensinVan + reportData.parkir + 
                            reportData.additionalExpenses.reduce((sum, exp) => sum + exp.amount, 0)
                          )))}
                        </span>
                      </div>
                      <div className="bg-indigo-50 rounded-2xl p-4 border border-indigo-100">
                        <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest block mb-1">Total Setor</span>
                        <span className="text-lg font-black text-indigo-700">{formatRupiah(reportData.totalSetor)}</span>
                      </div>
                    </div>
                    
                    <div className="bg-slate-900 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden mb-4">
                      <div className="relative z-10">
                        <span className="text-[10px] font-bold text-blue-400 uppercase tracking-[0.3em] block mb-1">Sisa Setoran</span>
                        <span className="text-3xl font-black text-white">
                          {formatRupiah(reportTotalSisa)}
                        </span>
                      </div>
                      <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl"></div>
                    </div>

                    {reportData.danaTidakTersetor > 0 && (
                      <>
                        <div className="bg-emerald-600 rounded-2xl p-4 text-white shadow-md mb-4">
                          <div className="flex justify-between items-start gap-4">
                            <div>
                              <p className="text-[10px] font-bold text-emerald-100 uppercase tracking-widest mb-1">Dana Tidak Tersetor</p>
                              <p className="text-2xl font-black">{formatRupiah(reportData.danaTidakTersetor)}</p>
                            </div>
                            {reportData.keteranganDana && (
                              <div className="text-right">
                                <p className="text-[10px] font-bold text-emerald-100 uppercase tracking-widest mb-1">Keterangan Dana</p>
                                <p className="text-sm text-emerald-50 italic">{reportData.keteranganDana}</p>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="bg-rose-700 rounded-2xl p-4 text-white shadow-md mb-4">
                          <p className="text-[10px] font-bold text-rose-200 uppercase tracking-widest mb-1">Total Tidak Tersetor</p>
                          <p className="text-2xl font-black">{formatRupiah(reportData.danaTidakTersetor + reportTotalSisa)}</p>
                        </div>
                        <div className="bg-blue-600 rounded-2xl p-4 text-white shadow-md mb-4">
                          <p className="text-[10px] font-bold text-blue-200 uppercase tracking-widest mb-1">Total Uang Ter Setor</p>
                          <p className="text-2xl font-black">{formatRupiah(reportData.totalSetor - reportData.danaTidakTersetor)}</p>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="history-tab"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <History className="w-5 h-5 text-blue-600" />
                    <h2 className="font-bold text-slate-700 uppercase tracking-wider text-sm">Riwayat Setoran</h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-400">{history.length} Laporan Tersimpan</span>
                    {history.length > 0 && (
                      <button 
                        onClick={deleteAllHistory}
                        className="text-xs font-bold text-rose-600 hover:text-rose-700"
                      >
                        Hapus Semua
                      </button>
                    )}
                  </div>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/50 border-b border-slate-100">
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Periode</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">PIC</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Total COP</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Transfer</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Pengeluaran</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Cash Bersih</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Total Setor</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Total Sisa</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {paginatedHistory.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="px-6 py-12 text-center">
                            <div className="flex flex-col items-center gap-2 text-slate-400">
                              <History className="w-8 h-8 opacity-20" />
                              <p className="text-sm font-medium italic">Belum ada riwayat laporan</p>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        paginatedHistory.map((item) => (
                          <tr key={item.id} className="hover:bg-slate-50/50 transition-colors group">
                            <td className="px-6 py-4">
                              <div className="flex flex-col">
                                <span className="text-xs font-bold text-slate-700">
                                  {format(new Date(item.startDate), "dd MMM yyyy", { locale: id })}
                                </span>
                                <span className="text-[10px] text-slate-400">s/d {format(new Date(item.endDate), "dd MMM yyyy", { locale: id })}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-xs font-medium text-slate-600">{item.picName}</span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <span className="text-xs font-medium text-slate-600">{formatRupiah(item.totalCOP)}</span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <span className="text-xs font-medium text-slate-600">{formatRupiah(item.transfer)}</span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <span className="text-xs font-medium text-rose-600">{formatRupiah(item.totalPengeluaran || (item.feederPH + item.feederCiamis + item.etoll + item.bensinVan + item.parkir + item.additionalExpenses.reduce((sum, exp) => sum + exp.amount, 0)))}</span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <span className="text-xs font-bold text-emerald-600">{formatRupiah(item.totalCashBersih)}</span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <span className="text-xs font-medium text-indigo-600">{formatRupiah(item.totalSetor)}</span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <span className="text-xs font-black text-blue-700">{formatRupiah(item.totalSisa)}</span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center justify-center gap-2">
                                <button 
                                  onClick={() => loadHistoryItem(item)}
                                  className="p-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-all"
                                  title="Lihat Laporan"
                                >
                                  <FileText className="w-4 h-4" />
                                </button>
                                <button 
                                  onClick={() => setItemToDelete(item.id)}
                                  className="p-2 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 transition-all"
                                  title="Hapus"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
                    <button 
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                      className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-blue-600 disabled:opacity-30 disabled:hover:text-slate-500 transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Sebelumnya
                    </button>
                    <div className="flex items-center gap-2">
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          className={cn(
                            "w-8 h-8 rounded-lg text-xs font-bold transition-all",
                            currentPage === page ? "bg-blue-600 text-white shadow-md" : "text-slate-400 hover:bg-slate-200"
                          )}
                        >
                          {page}
                        </button>
                      ))}
                    </div>
                    <button 
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                      className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-blue-600 disabled:opacity-30 disabled:hover:text-slate-500 transition-colors"
                    >
                      Selanjutnya
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </section>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="max-w-4xl mx-auto px-4 mt-12 text-center">
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em] mb-2">Designed by</p>
          <p className="text-sm font-black text-slate-700 tracking-tight">Nurohmat Amin, S.M., M.M., CPHRM, M.M</p>
        </div>
      </footer>

      {/* Modal Additional Expense */}
      <AnimatePresence>
        {showAdditionalModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAdditionalModal(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-md relative z-10 overflow-hidden"
            >
              <div className="bg-blue-700 p-6 text-white">
                <h3 className="text-lg font-black uppercase tracking-tight">
                  {editingExpenseId ? "Edit Pengeluaran" : "Tambah Pengeluaran"}
                </h3>
                <p className="text-blue-100 text-xs font-medium">
                  {editingExpenseId ? "Ubah detail pengeluaran" : "Masukkan detail pengeluaran tambahan"}
                </p>
              </div>
              <div className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">Nama Pengeluaran</label>
                  <input 
                    type="text" 
                    placeholder="Contoh: ATK, Kebersihan, dll"
                    value={newExpense.name}
                    onChange={(e) => setNewExpense(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">Jumlah (Rp)</label>
                  <input 
                    type="number" 
                    placeholder="0"
                    value={newExpense.amount || ""}
                    onChange={(e) => setNewExpense(prev => ({ ...prev, amount: Number(e.target.value) }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button 
                    onClick={() => setShowAdditionalModal(false)}
                    className="flex-1 px-4 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-50 transition-colors"
                  >
                    Batal
                  </button>
                  <button 
                    onClick={saveAdditionalExpense}
                    className="flex-1 bg-blue-700 hover:bg-blue-800 text-white px-4 py-3 rounded-xl font-bold transition-all shadow-md"
                  >
                    {editingExpenseId ? "Simpan Perubahan" : "Simpan"}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Image View */}
      <AnimatePresence>
        {showImageModal && reportImage && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowImageModal(false)}
              className="absolute inset-0 bg-slate-900/90 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl relative z-10 overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="bg-slate-100 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                <h3 className="font-bold text-slate-700">Pratinjau Gambar Nota</h3>
                <div className="flex gap-2">
                  <a 
                    href={reportImage || ""}
                    download="nota-setoran.png"
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-bold transition-all shadow-sm"
                  >
                    Download
                  </a>
                  <button 
                    onClick={() => setShowImageModal(false)}
                    className="text-slate-400 hover:text-slate-600 p-1"
                  >
                    <Plus className="w-6 h-6 rotate-45" />
                  </button>
                </div>
              </div>
              <div className="p-4 overflow-y-auto bg-slate-200 flex justify-center">
                <img 
                  src={reportImage} 
                  alt="Report Preview" 
                  className="max-w-full h-auto shadow-lg rounded-lg"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div className="p-4 bg-white border-t border-slate-100 flex gap-3">
                <button 
                  onClick={() => {
                    const link = document.createElement('a');
                    link.download = `Laporan_COP_${reportData?.startDate || 'report'}.png`;
                    link.href = reportImage;
                    link.click();
                  }}
                  className="flex-1 bg-blue-700 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Download Gambar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Konfirmasi Hapus */}
      <AnimatePresence>
        {itemToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setItemToDelete(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-sm relative z-10 overflow-hidden p-8 text-center"
            >
              <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <Trash2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-2">Hapus Riwayat?</h3>
              <p className="text-slate-500 text-sm mb-8">
                Data yang dihapus tidak dapat dikembalikan. Apakah Anda yakin?
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setItemToDelete(null)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 py-3 rounded-xl font-bold transition-all"
                >
                  Batal
                </button>
                <button 
                  onClick={() => deleteHistoryItem(itemToDelete)}
                  className="flex-1 bg-rose-600 hover:bg-rose-700 text-white py-3 rounded-xl font-bold transition-all shadow-lg shadow-rose-200"
                >
                  Ya, Hapus
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 20, x: '-50%' }}
            className={cn(
              "fixed bottom-8 left-1/2 z-[100] px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 min-w-[280px] border",
              toast.type === 'success' ? "bg-emerald-50 border-emerald-100 text-emerald-800" :
              toast.type === 'error' ? "bg-rose-50 border-rose-100 text-rose-800" :
              "bg-slate-800 border-slate-700 text-white"
            )}
          >
            {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
            {toast.type === 'error' && <Plus className="w-5 h-5 text-rose-500 rotate-45" />}
            {toast.type === 'info' && <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />}
            <span className="text-sm font-bold">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #e2e8f0;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #cbd5e1;
        }
      `}</style>
    </div>
  );
}
