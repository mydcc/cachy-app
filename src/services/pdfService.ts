import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { JournalEntry } from '../stores/types';
import { formatDate } from '../utils/utils';
import Decimal from 'decimal.js';

// Extend jsPDF to include autoTable
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
  }
}

interface JournalReportOptions {
  period?: string;
  generatedBy?: string;
}

const formatCurrency = (val: number | string | Decimal | undefined): string => {
  if (val === undefined || val === null) return '0.00';
  const num = typeof val === 'object' ? val.toNumber() : (typeof val === 'string' ? parseFloat(val) : val);
  return num.toFixed(2);
};

export const generateJournalReport = (trades: JournalEntry[], options: JournalReportOptions = {}) => {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  // --- Calculations for Summary ---
  let totalPnl = new Decimal(0);
  let totalFees = new Decimal(0);
  let winCount = 0;

  trades.forEach(t => {
    // PnL
    const pnl = t.totalNetProfit ? new Decimal(t.totalNetProfit) : new Decimal(0);
    totalPnl = totalPnl.plus(pnl);

    if (pnl.greaterThan(0)) winCount++;

    // Fees (Trading + Funding)
    const tFee = t.tradingFee ? new Decimal(t.tradingFee) : new Decimal(0);
    const fFee = t.fundingFee ? new Decimal(t.fundingFee) : new Decimal(0);
    totalFees = totalFees.plus(tFee).plus(fFee);
  });

  const totalTrades = trades.length;
  const winRate = totalTrades > 0 ? (winCount / totalTrades) * 100 : 0;

  // --- Header ---
  const pageWidth = doc.internal.pageSize.width;
  doc.setFontSize(20);
  doc.text('Trading Journal Report', 14, 20);

  doc.setFontSize(10);
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, pageWidth - 14, 20, { align: 'right' });
  if (options.period) {
    doc.text(`Period: ${options.period}`, 14, 28);
  }

  // --- Summary Section ---
  const startY = 35;
  const boxWidth = 45;
  const boxHeight = 20;
  const gap = 10;

  // Helper to draw summary box
  const drawSummaryBox = (x: number, title: string, value: string, color: [number, number, number] = [240, 240, 240]) => {
    doc.setFillColor(...color);
    doc.roundedRect(x, startY, boxWidth, boxHeight, 2, 2, 'F');
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text(title, x + 5, startY + 7);
    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text(value, x + 5, startY + 16);
  };

  drawSummaryBox(14, 'Total PnL', `${formatCurrency(totalPnl)} $`, totalPnl.greaterThanOrEqualTo(0) ? [220, 255, 220] : [255, 220, 220]);
  drawSummaryBox(14 + boxWidth + gap, 'Total Fees', `${formatCurrency(totalFees)} $`);
  drawSummaryBox(14 + (boxWidth + gap) * 2, 'Total Trades', `${totalTrades}`);
  drawSummaryBox(14 + (boxWidth + gap) * 3, 'Win Rate', `${winRate.toFixed(1)}%`);

  // --- Table Section ---
  const tableData = trades.map(t => {
    const entryDate = t.entryDate ? formatDate(t.entryDate) : '-';
    // For exit date, use exitDate if available, else derive from closedAt or leave blank
    const exitDate = t.exitDate ? formatDate(t.exitDate) : (t.status === 'Closed' ? 'Closed' : 'Open');

    // Determine Type (Long/Short)
    const type = t.tradeType ? t.tradeType.toUpperCase() : '-';

    // Fees
    const fees = (new Decimal(t.tradingFee || 0).plus(t.fundingFee || 0)).toNumber();

    // Entry Price (might be Decimal or number)
    // t.entryPrice is Decimal in interface

    return [
      entryDate,
      t.symbol,
      type,
      t.leverage ? `${t.leverage}x` : '-',
      formatCurrency(t.entryPrice),
      // Use exit price if available (closed trade), otherwise show SL as a fallback indicator for open trades?
      // User explicitly asked for Entry/Exit Date and Prices.
      // If t.exitPrice is not available (open trade), we can show '-' or current mark price if we had it.
      // Let's stick to showing Exit Price if it exists.
      t.exitPrice ? formatCurrency(t.exitPrice) : '-',
      formatCurrency(fees),
      formatCurrency(t.totalNetProfit),
      exitDate
    ];
  });

  autoTable(doc, {
    startY: startY + boxHeight + 15,
    head: [['Entry Date', 'Symbol', 'Type', 'Lev.', 'Entry', 'Exit', 'Fees', 'PnL', 'Exit Date']],
    body: tableData,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [41, 50, 65] }, // Dark Slate
    alternateRowStyles: { fillColor: [245, 245, 245] },
    columnStyles: {
      4: { halign: 'right' }, // Entry
      5: { halign: 'right' }, // Exit Price
      6: { halign: 'right' }, // Fees
      7: { halign: 'right' }, // PnL
      8: { halign: 'right' }  // Exit Date
    },
    didParseCell: (data) => {
        // Color PnL column
        if (data.section === 'body' && data.column.index === 7) {
             const rawValue = parseFloat(data.cell.raw as string);
             if (rawValue > 0) {
                 data.cell.styles.textColor = [0, 180, 0];
             } else if (rawValue < 0) {
                 data.cell.styles.textColor = [200, 0, 0];
             }
        }
    }
  });

  // Footer
  const pageCount = doc.internal.pages.length - 1; // fix for empty page bug in some versions
  for(let i = 1; i <= pageCount; i++) {
     doc.setPage(i);
     doc.setFontSize(8);
     doc.setTextColor(150);
     doc.text(`Page ${i} of ${pageCount} - Generated by Cachy`, pageWidth / 2, doc.internal.pageSize.height - 10, { align: 'center' });
  }

  doc.save('journal_report.pdf');
};

export const pdfService = {
  generateJournalReport
};
