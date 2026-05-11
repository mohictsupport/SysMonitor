import { createLazyFileRoute } from "@tanstack/react-router";
import { TopNav } from "@/components/TopNav";
import { useState, useMemo } from "react";
import { useNetbirdSites } from "@/lib/use-netbird";

// Helper to check if OS is a device (Android, iOS, Windows, macOS, Linux - user devices)
const isDeviceOS = (os?: string) => {
  if (!os) return false;
  const osLower = os.toLowerCase();
  return (
    osLower.includes("android") ||
    osLower.includes("ios") ||
    osLower.includes("windows") ||
    osLower.includes("mac") ||
    osLower.includes("darwin") ||
    osLower.includes("ubuntu") ||
    osLower.includes("linux")
  );
};
import { useHasApiKey } from "@/lib/auth-utils";
import { ApiKeyGate } from "@/components/ApiKeyGate";
import {
  useDailyStats,
  aggregateMonthly,
  aggregateQuarterly,
  type DailyStats,
  type MonthlySiteStats,
  type QuarterlySiteStats
} from "@/lib/use-uptime-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Calendar,
  Clock,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  FileDown,
  X,
  Activity,
  Server,
  CheckCircle,
  AlertCircle
} from "lucide-react";
// jsPDF dynamically imported in exportPDF function for code splitting

export const Route = createLazyFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Reports — Site Guardian Pro" },
      { name: "description", content: "View uptime reports and analytics." },
    ],
  }),
  component: ReportsPage,
});

type ReportType = "daily" | "monthly" | "quarterly";

interface SiteDetails {
  label: string;
  device_name: string;
  uptime: number;
  total_checks: number;
  online_checks: number;
}

function ReportsPage() {
  const hasApiKey = useHasApiKey();
  const [reportType, setReportType] = useState<ReportType>("daily");
  const [dateRange, setDateRange] = useState<"7d" | "30d" | "90d" | "1y">("30d");
  const [selectedSite, setSelectedSite] = useState<SiteDetails | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalView, setModalView] = useState<"daily" | "monthly" | "quarterly">("daily");

  // Check NetBird API connection
  const { sites, loading: sitesLoading, error: sitesError } = useNetbirdSites();
  
  const hasValidApi = !sitesError && sites.length > 0;

  // Calculate date range
  const { startDate, endDate } = useMemo(() => {
    const end = new Date();
    const start = new Date();
    
    switch (dateRange) {
      case "7d":
        start.setDate(end.getDate() - 7);
        break;
      case "30d":
        start.setDate(end.getDate() - 30);
        break;
      case "90d":
        start.setDate(end.getDate() - 90);
        break;
      case "1y":
        start.setFullYear(end.getFullYear() - 1);
        break;
    }

    return {
      startDate: start.toISOString().split("T")[0],
      endDate: end.toISOString().split("T")[0],
    };
  }, [dateRange]);

  // Fetch daily stats from Firestore (real-time via onSnapshot)
  const { stats: dailyStats, loading, error } = useDailyStats(startDate, endDate);

  // Build set of device names that are user devices (to exclude from reports)
  const deviceNamesSet = useMemo(() => {
    const deviceNames = new Set<string>();
    sites.forEach(site => {
      if (isDeviceOS(site.os)) {
        deviceNames.add(site.name);
      }
    });
    return deviceNames;
  }, [sites]);

  // Filter daily stats to exclude devices (only infrastructure sites)
  const filteredDailyStats = useMemo(() => {
    return dailyStats.filter(stat => !deviceNamesSet.has(stat.device_name));
  }, [dailyStats, deviceNamesSet]);

  // Aggregate data based on report type
  const reportData = useMemo((): SiteDetails[] => {
    if (reportType === "daily") {
      return filteredDailyStats.map((stat) => ({
        label: stat.date,
        device_name: stat.device_name,
        uptime: stat.uptime,
        total_checks: stat.total_checks,
        online_checks: stat.online_checks,
      }));
    }

    if (reportType === "monthly") {
      return aggregateMonthly(filteredDailyStats).map((m: MonthlySiteStats) => {
        // Format "2024-01" to "January 2024"
        const [year, monthNum] = m.month.split('-');
        const date = new Date(parseInt(year), parseInt(monthNum) - 1, 1);
        const formattedMonth = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        return {
          label: formattedMonth,
          device_name: m.device_name,
          uptime: m.uptime,
          total_checks: m.total_checks,
          online_checks: m.online_checks,
        };
      });
    }

    return aggregateQuarterly(filteredDailyStats).map((q: QuarterlySiteStats) => {
      // Format "2024-Q1" to "Q1 2024 (Jan-Mar)"
      const [year, quarter] = q.quarter.split('-');
      const quarterNum = parseInt(quarter.replace('Q', ''));
      const startMonth = (quarterNum - 1) * 3;
      const endMonth = startMonth + 2;
      const startDate = new Date(parseInt(year), startMonth, 1);
      const endDate = new Date(parseInt(year), endMonth, 1);
      const startMonthName = startDate.toLocaleDateString('en-US', { month: 'short' });
      const endMonthName = endDate.toLocaleDateString('en-US', { month: 'short' });
      const formattedQuarter = `${quarter} ${year} (${startMonthName}-${endMonthName})`;
      return {
        label: formattedQuarter,
        device_name: q.device_name,
        uptime: q.uptime,
        total_checks: q.total_checks,
        online_checks: q.online_checks,
      };
    });
  }, [dailyStats, reportType]);

  // Calculate overall stats (excluding devices)
  const overallStats = useMemo(() => {
    if (filteredDailyStats.length === 0) return null;

    const totalChecks = filteredDailyStats.reduce((sum, s) => sum + s.total_checks, 0);
    const onlineChecks = filteredDailyStats.reduce((sum, s) => sum + s.online_checks, 0);
    const uniqueSites = new Set(filteredDailyStats.map((s) => s.device_id)).size;

    return {
      avgUptime: totalChecks > 0 ? Math.round((onlineChecks / totalChecks) * 1000) / 10 : 0,
      totalChecks,
      onlineChecks,
      uniqueSites,
      daysCovered: filteredDailyStats.length / uniqueSites || 0,
    };
  }, [filteredDailyStats]);

  // Get trend data for selected site - Daily
  const getSiteTrendData = useMemo(() => {
    if (!selectedSite) return [];

    const siteDailyData = dailyStats
      .filter((s) => s.device_name === selectedSite.device_name)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((s) => ({
        date: s.date,
        uptime: s.uptime,
        checks: s.total_checks,
        online: s.online_checks,
        offline: s.total_checks - s.online_checks,
      }));

    return siteDailyData;
  }, [selectedSite, dailyStats]);

  // Get trend data for selected site - Monthly
  const getSiteMonthlyTrendData = useMemo(() => {
    if (!selectedSite) return [];

    const siteDailyData = dailyStats.filter((s) => s.device_name === selectedSite.device_name);

    const byMonth = new Map<string, { total_checks: number; online_checks: number }>();

    siteDailyData.forEach((stat) => {
      const month = stat.date.substring(0, 7); // YYYY-MM
      const current = byMonth.get(month) || { total_checks: 0, online_checks: 0 };
      current.total_checks += stat.total_checks;
      current.online_checks += stat.online_checks;
      byMonth.set(month, current);
    });

    return Array.from(byMonth.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, data]) => ({
        date: month,
        uptime: data.total_checks > 0 ? Math.round((data.online_checks / data.total_checks) * 10000) / 100 : 0,
        checks: data.total_checks,
        online: data.online_checks,
        offline: data.total_checks - data.online_checks,
      }));
  }, [selectedSite, dailyStats]);

  // Get trend data for selected site - Quarterly
  const getSiteQuarterlyTrendData = useMemo(() => {
    if (!selectedSite) return [];

    const siteDailyData = dailyStats.filter((s) => s.device_name === selectedSite.device_name);

    const byQuarter = new Map<string, { total_checks: number; online_checks: number }>();

    siteDailyData.forEach((stat) => {
      const date = new Date(stat.date);
      const quarter = Math.floor(date.getMonth() / 3) + 1;
      const key = `${date.getFullYear()}-Q${quarter}`;
      const current = byQuarter.get(key) || { total_checks: 0, online_checks: 0 };
      current.total_checks += stat.total_checks;
      current.online_checks += stat.online_checks;
      byQuarter.set(key, current);
    });

    return Array.from(byQuarter.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([quarter, data]) => ({
        date: quarter,
        uptime: data.total_checks > 0 ? Math.round((data.online_checks / data.total_checks) * 10000) / 100 : 0,
        checks: data.total_checks,
        online: data.online_checks,
        offline: data.total_checks - data.online_checks,
      }));
  }, [selectedSite, dailyStats]);

  // Handle site click
  const handleSiteClick = (site: SiteDetails) => {
    setSelectedSite(site);
    setIsModalOpen(true);
  };

  // Close modal
  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedSite(null);
    setModalView("daily");
  };

  // If no API key or API error, show gate/error
  if (!hasApiKey || sitesError) {
    return (
      <div className="min-h-dvh bg-background text-foreground">
        <TopNav />
        <main className="mx-auto max-w-[1600px] p-6">
          {!hasApiKey ? <ApiKeyGate /> : (
            <div className="text-center py-8">
              <p className="text-red-500 font-medium">NetBird API connection failed</p>
              <p className="text-muted-foreground mt-2">Reports require valid API connection to show site data.</p>
            </div>
          )}
        </main>
      </div>
    );
  }


  // Helper function to load image as base64
  const loadImageAsBase64 = async (url: string): Promise<string | null> => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error("Failed to load image:", error);
      return null;
    }
  };

  const exportPDF = async () => {
    // Dynamically import jsPDF and autoTable only when needed
    const [{ jsPDF }, autoTable] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable").then(m => m.default)
    ]);
    const doc = new jsPDF();
    const now = new Date();
    const dateStr = now.toLocaleDateString();
    const timeStr = now.toLocaleTimeString();
    
    // Color scheme - Professional blue/grey
    const primaryColor = [41, 98, 255]; // Blue
    const secondaryColor = [99, 102, 241]; // Indigo
    const darkColor = [31, 41, 55]; // Dark grey
    const lightGrey = [243, 244, 246]; // Light grey
    
    // ===== HEADER =====
    let yPos = 15;
    const headerHeight = 40;
    
    // Background header bar
    doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.rect(0, yPos, 210, headerHeight, "F");
    
    // Logo/Title (left side)
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont("helvetica", "bold");
    doc.text("SysMonitor", 14, yPos + 20);
    
    // Subtitle (left side)
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text("Network Uptime Monitoring Report", 14, yPos + 28);
    
    // Report info box (top right)
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(140, yPos + 8, 60, 22, 3, 3, "F");
    doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("REPORT DETAILS", 144, yPos + 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text(`Type: ${reportType.toUpperCase()}`, 144, yPos + 19);
    doc.text(`Generated: ${dateStr} ${timeStr}`, 144, yPos + 24);
    doc.text(`Period: ${dateRange}`, 144, yPos + 29);
    
    // ===== SUMMARY CARDS =====
    yPos += 50;
    
    if (overallStats) {
      // Card 1: Average Uptime
      doc.setFillColor(lightGrey[0], lightGrey[1], lightGrey[2]);
      doc.roundedRect(14, yPos, 45, 30, 3, 3, "F");
      doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.setLineWidth(0.5);
      doc.line(14, yPos, 59, yPos);
      doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.text("AVG UPTIME", 18, yPos + 6);
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text(`${overallStats.avgUptime}%`, 18, yPos + 18);
      
      // Card 2: Total Checks
      doc.setFillColor(lightGrey[0], lightGrey[1], lightGrey[2]);
      doc.roundedRect(64, yPos, 45, 30, 3, 3, "F");
      doc.setDrawColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
      doc.line(64, yPos, 109, yPos);
      doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.text("TOTAL CHECKS", 68, yPos + 6);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
      doc.text(overallStats.totalChecks.toLocaleString(), 68, yPos + 18);
      
      // Card 3: Sites Monitored
      doc.setFillColor(lightGrey[0], lightGrey[1], lightGrey[2]);
      doc.roundedRect(114, yPos, 45, 30, 3, 3, "F");
      doc.setDrawColor(34, 197, 94); // Green
      doc.line(114, yPos, 159, yPos);
      doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.text("SITES", 118, yPos + 6);
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(34, 197, 94);
      doc.text(String(overallStats.uniqueSites), 118, yPos + 18);
      
      // Card 4: Days Covered
      doc.setFillColor(lightGrey[0], lightGrey[1], lightGrey[2]);
      doc.roundedRect(164, yPos, 32, 30, 3, 3, "F");
      doc.setDrawColor(245, 158, 11); // Amber
      doc.line(164, yPos, 196, yPos);
      doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      doc.text("DAYS", 168, yPos + 6);
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(245, 158, 11);
      doc.text(String(Math.round(overallStats.daysCovered)), 168, yPos + 18);
    }
    
    // ===== DATA TABLE =====
    yPos += 40;
    
    // Table title
    doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(`${reportType.charAt(0).toUpperCase() + reportType.slice(1)} Uptime Data`, 14, yPos);
    
    // Prepare table data
    const tableHeaders = [
      { header: reportType === "daily" ? "Date" : "Period", dataKey: "label" },
      { header: "Device", dataKey: "device_name" },
      { header: "Uptime %", dataKey: "uptime" },
      { header: "Checks", dataKey: "total_checks" },
      { header: "Online", dataKey: "online_checks" }
    ];

    // For daily reports, group by date and add day headers
    let tableBody: any[] = [];
    if (reportType === "daily") {
      // Group by date
      const groupedByDate = reportData.reduce((acc, row) => {
        const date = row.label;
        if (!acc[date]) acc[date] = [];
        acc[date].push(row);
        return acc;
      }, {} as Record<string, SiteDetails[]>);

      // Sort dates descending
      const sortedDates = Object.keys(groupedByDate).sort((a, b) => b.localeCompare(a));

      sortedDates.forEach((date) => {
        const dateObj = new Date(date);
        const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
        const formattedDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        
        // Add day header row (will be styled differently)
        tableBody.push({
          isDayHeader: true,
          label: `${dayName}, ${formattedDate}`,
          device_name: '',
          uptime: '',
          total_checks: '',
          online_checks: ''
        });

        // Add data rows for this day
        groupedByDate[date].forEach((row) => {
          tableBody.push({
            isDayHeader: false,
            label: '', // Empty since date is in header
            device_name: String(row.device_name),
            uptime: typeof row.uptime === 'number' ? `${row.uptime.toFixed(1)}%` : 'N/A',
            total_checks: row.total_checks?.toLocaleString() || '',
            online_checks: row.online_checks?.toLocaleString() || ''
          });
        });
      });
    } else {
      // Monthly/Quarterly - flat table
      tableBody = reportData.map((row) => ({
        isDayHeader: false,
        label: String(row.label),
        device_name: String(row.device_name),
        uptime: typeof row.uptime === 'number' ? `${row.uptime.toFixed(1)}%` : 'N/A',
        total_checks: row.total_checks?.toLocaleString() || '',
        online_checks: row.online_checks?.toLocaleString() || '',
      }));
    }

    // Helper function to draw footer
    const drawFooter = (pageNum: number, totalPages: number) => {
      const pageHeight = doc.internal.pageSize.height;
      
      // Footer line
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.3);
      doc.line(14, pageHeight - 20, 196, pageHeight - 20);
      
      // Footer text
      doc.setTextColor(150, 150, 150);
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.text("SysMonitor - Professional Network Monitoring", 14, pageHeight - 14);
      doc.text("Report Generated by SysMonitor a MOH Network Monitoring System", 14, pageHeight - 9);
      doc.text(`Page ${pageNum} of ${totalPages} | ${dateStr}`, 196, pageHeight - 9, { align: "right" });
    };

    // Track total pages
    let totalPages = 1;

    // Generate table
    autoTable(doc, {
      startY: yPos + 5,
      head: [tableHeaders.map(h => h.header)],
      body: tableBody.map(row => [
        row.label,
        row.device_name,
        row.uptime,
        row.total_checks,
        row.online_checks,
      ]),
      theme: 'grid',
      headStyles: {
        fillColor: primaryColor as unknown as [number, number, number],
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 8,
        cellPadding: 3,
        lineColor: 255, // White borders between headers
        lineWidth: 0.5,
      },
      bodyStyles: {
        fontSize: 8,
        cellPadding: 3,
        textColor: darkColor as unknown as [number, number, number],
      },
      alternateRowStyles: {
        fillColor: [250, 250, 250],
      },
      columnStyles: {
        0: { cellWidth: 'auto' },
        [tableHeaders.length - 1]: { halign: 'right' },
      },
      margin: { left: 14, right: 14, bottom: 25 }, // Add bottom margin for footer
      styles: {
        overflow: 'linebreak',
      },
      // Style day headers differently
      didParseCell: (hookData) => {
        // Only style body rows, not header rows
        if (hookData.row.section !== 'body') return;
        
        const rowIndex = hookData.row.index;
        const rowData = tableBody[rowIndex];
        if (rowData?.isDayHeader) {
          // Style day header rows
          hookData.cell.styles.fillColor = [230, 240, 255]; // Light blue
          hookData.cell.styles.fontStyle = 'bold';
          hookData.cell.styles.fontSize = 9;
          // Merge all columns for day header
          if (hookData.column.index === 0) {
            hookData.cell.colSpan = tableHeaders.length;
          } else {
            hookData.cell.text = '';
          }
        }
      },
      didDrawPage: (data) => {
        // Update total pages based on current page count
        totalPages = data.pageCount || 1;
        // Draw footer on each page
        drawFooter(data.pageNumber || 1, totalPages);
      },
    });
    
    // ===== UPTIME VISUALIZATION =====
    const finalY = (doc as any).lastAutoTable?.finalY || yPos + 50;
    const finalPage = doc.getNumberOfPages();
    
    if (overallStats && overallStats.avgUptime > 0) {
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
      doc.text("Uptime Overview", 14, finalY + 15);
      
      // Uptime bar background
      doc.setFillColor(229, 231, 235);
      doc.roundedRect(14, finalY + 20, 182, 12, 2, 2, "F");
      
      // Uptime bar fill
      const uptimeWidth = (overallStats.avgUptime / 100) * 182;
      const barColor = overallStats.avgUptime >= 99 ? [34, 197, 94] : overallStats.avgUptime >= 95 ? [245, 158, 11] : [239, 68, 68];
      doc.setFillColor(barColor[0], barColor[1], barColor[2]);
      doc.roundedRect(14, finalY + 20, uptimeWidth, 12, 2, 2, "F");
      
      // Uptime text
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text(`${overallStats.avgUptime}%`, 16, finalY + 28);
    }
    
    // Re-draw footer on the last page with correct total page count
    const finalTotalPages = doc.getNumberOfPages();
    doc.setPage(finalTotalPages);
    
    // Helper to draw footer with correct total
    const drawFinalFooter = (pageNum: number, totalPagesNum: number) => {
      const pageHeight = doc.internal.pageSize.height;
      
      // Footer line
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.3);
      doc.line(14, pageHeight - 20, 196, pageHeight - 20);
      
      // Footer text
      doc.setTextColor(150, 150, 150);
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.text("SysMonitor - Professional Network Monitoring", 14, pageHeight - 14);
      doc.text("Report Generated by SysMonitor a MOH Network Monitoring System", 14, pageHeight - 9);
      doc.text(`Page ${pageNum} of ${totalPagesNum} | ${dateStr}`, 196, pageHeight - 9, { align: "right" });
    };
    
    drawFinalFooter(finalTotalPages, finalTotalPages);
    
    // Save
    doc.save(`SysMonitor-Report-${reportType}-${now.toISOString().split("T")[0]}.pdf`);
  };

  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <main className="mx-auto max-w-[1200px] p-6">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-dim">
              Analytics
            </p>
            <h1 className="mt-1 text-2xl font-medium tracking-tight">Uptime Reports</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              onClick={() => exportPDF()} 
              disabled={loading || reportData.length === 0}
            >
              <FileDown className="w-4 h-4 mr-2" />
              Export PDF
            </Button>
          </div>
        </div>

        {/* Controls */}
        <div className="mb-6 flex flex-wrap gap-4">
          {/* Report Type */}
          <div className="flex rounded-md border border-border overflow-hidden">
            {(["daily", "monthly", "quarterly"] as ReportType[]).map((type) => (
              <button
                key={type}
                onClick={() => setReportType(type)}
                className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
                  reportType === type
                    ? "bg-accent text-accent-foreground"
                    : "bg-background hover:bg-muted"
                }`}
              >
                {type}
              </button>
            ))}
          </div>

          {/* Date Range */}
          <div className="flex rounded-md border border-border overflow-hidden">
            {(["7d", "30d", "90d", "1y"] as const).map((range) => (
              <button
                key={range}
                onClick={() => setDateRange(range)}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  dateRange === range
                    ? "bg-accent text-accent-foreground"
                    : "bg-background hover:bg-muted"
                }`}
              >
                {range === "7d" && "Last 7 Days"}
                {range === "30d" && "Last 30 Days"}
                {range === "90d" && "Last 90 Days"}
                {range === "1y" && "Last Year"}
              </button>
            ))}
          </div>
        </div>

        {/* Overall Stats */}
        {overallStats && (
          <div className="mb-6 grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Avg Uptime</span>
                </div>
                <p className="mt-2 text-2xl font-bold">{overallStats.avgUptime}%</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Total Checks</span>
                </div>
                <p className="mt-2 text-2xl font-bold">{overallStats.totalChecks.toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Server className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Sites Monitored</span>
                </div>
                <p className="mt-2 text-2xl font-bold">{overallStats.uniqueSites}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Days Covered</span>
                </div>
                <p className="mt-2 text-2xl font-bold">{Math.round(overallStats.daysCovered)}</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Data Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="w-5 h-5" />
              {reportType === "daily" && "Daily Uptime Details"}
              {reportType === "monthly" && "Monthly Uptime Details"}
              {reportType === "quarterly" && "Quarterly Uptime Details"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-center py-8 text-muted-foreground">Loading report data...</p>
            ) : error ? (
              <p className="text-center py-8 text-red-500">Error: {error}</p>
            ) : reportData.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">
                No data available for selected period.
                <br />
                <span className="text-sm">
                  Data is collected every 15 minutes by the monitoring service.
                </span>
              </p>
            ) : reportType === "daily" ? (
              // Daily report with one main header and day subheaders
              <div className="overflow-x-auto">
                <table className="w-full">
                  {/* One main sticky header with white column separators */}
                  <thead className="bg-muted/80 sticky top-0 z-10">
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-4 font-medium text-foreground border-r border-border">Device</th>
                      <th className="text-right py-3 px-4 font-medium text-foreground border-r border-border">Uptime %</th>
                      <th className="text-right py-3 px-4 font-medium text-foreground border-r border-border">Total Checks</th>
                      <th className="text-right py-3 px-4 font-medium text-foreground">Online</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      // Group by date
                      const groupedByDate = reportData.reduce((acc, row) => {
                        const date = row.label;
                        if (!acc[date]) acc[date] = [];
                        acc[date].push(row);
                        return acc;
                      }, {} as Record<string, SiteDetails[]>);

                      // Sort dates descending (newest first)
                      const sortedDates = Object.keys(groupedByDate).sort((a, b) => b.localeCompare(a));

                      return sortedDates.flatMap((date) => {
                        const dateObj = new Date(date);
                        const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
                        const formattedDate = dateObj.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
                        const rows = groupedByDate[date];

                        return [
                          // Day header row
                          <tr key={`header-${date}`} className="bg-accent/50 border-b border-border">
                            <td colSpan={4} className="py-2 px-4 font-medium text-foreground">
                              {dayName}, {formattedDate}
                            </td>
                          </tr>,
                          // Data rows for this day
                          ...rows.map((row, i) => (
                            <tr
                              key={`${date}-${i}`}
                              className="border-b border-border/50 hover:bg-muted/50 cursor-pointer transition-colors"
                              onClick={() => handleSiteClick(row)}
                              title="Click to view site details"
                            >
                              <td className="py-3 px-4 border-r border-border">
                                <span className="flex items-center gap-2">
                                  <Server className="w-4 h-4 text-muted-foreground" />
                                  {row.device_name}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-right border-r border-border">
                                <Badge
                                  variant={typeof row.uptime === 'number' && row.uptime >= 99 ? "default" : typeof row.uptime === 'number' && row.uptime >= 95 ? "secondary" : "destructive"}
                                >
                                  {typeof row.uptime === 'number' ? `${row.uptime.toFixed(1)}%` : 'N/A'}
                                </Badge>
                              </td>
                              <td className="py-3 px-4 text-right border-r border-border">{row.total_checks?.toLocaleString()}</td>
                              <td className="py-3 px-4 text-right">{row.online_checks?.toLocaleString()}</td>
                            </tr>
                          ))
                        ];
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            ) : (
              // Monthly/Quarterly report - flat table
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-4 font-medium">Period</th>
                      <th className="text-left py-3 px-4 font-medium">Device</th>
                      <th className="text-right py-3 px-4 font-medium">Uptime %</th>
                      <th className="text-right py-3 px-4 font-medium">Total Checks</th>
                      <th className="text-right py-3 px-4 font-medium">Online</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.map((row, i) => (
                      <tr
                        key={i}
                        className="border-b border-border/50 hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => handleSiteClick(row)}
                        title="Click to view site details"
                      >
                        <td className="py-3 px-4">{row.label}</td>
                        <td className="py-3 px-4">
                          <span className="flex items-center gap-2">
                            <Server className="w-4 h-4 text-muted-foreground" />
                            {row.device_name}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Badge
                            variant={typeof row.uptime === 'number' && row.uptime >= 99 ? "default" : typeof row.uptime === 'number' && row.uptime >= 95 ? "secondary" : "destructive"}
                          >
                            {typeof row.uptime === 'number' ? `${row.uptime.toFixed(1)}%` : 'N/A'}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-right">{row.total_checks?.toLocaleString()}</td>
                        <td className="py-3 px-4 text-right">{row.online_checks?.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Site Details Modal */}
      <Dialog open={isModalOpen} onOpenChange={(open) => { if (!open) handleCloseModal(); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Server className="w-5 h-5" />
              {selectedSite?.device_name}
            </DialogTitle>
          </DialogHeader>

          {selectedSite && (
            <div className="space-y-6">
              {/* Stats Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Activity className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Uptime</span>
                    </div>
                    <p className={`text-2xl font-bold ${selectedSite.uptime >= 99 ? 'text-green-600' : selectedSite.uptime >= 95 ? 'text-amber-600' : 'text-red-600'}`}>
                      {selectedSite.uptime.toFixed(1)}%
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      <span className="text-sm text-muted-foreground">Online Checks</span>
                    </div>
                    <p className="text-2xl font-bold text-green-600">
                      {selectedSite.online_checks.toLocaleString()}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertCircle className="w-4 h-4 text-red-500" />
                      <span className="text-sm text-muted-foreground">Failed Checks</span>
                    </div>
                    <p className="text-2xl font-bold text-red-600">
                      {(selectedSite.total_checks - selectedSite.online_checks).toLocaleString()}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Site Performance Summary */}
              <div className="space-y-4">
                {/* Quick Stats */}
                {getSiteTrendData.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-muted/50 rounded-lg p-3 text-center">
                      <p className="text-xs text-muted-foreground mb-1">Best Day</p>
                      <p className="text-lg font-semibold text-green-600">
                        {Math.max(...getSiteTrendData.map(d => d.uptime)).toFixed(1)}%
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {getSiteTrendData.find(d => d.uptime === Math.max(...getSiteTrendData.map(x => x.uptime)))?.date}
                      </p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-3 text-center">
                      <p className="text-xs text-muted-foreground mb-1">Worst Day</p>
                      <p className="text-lg font-semibold text-red-600">
                        {Math.min(...getSiteTrendData.map(d => d.uptime)).toFixed(1)}%
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {getSiteTrendData.find(d => d.uptime === Math.min(...getSiteTrendData.map(x => x.uptime)))?.date}
                      </p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-3 text-center">
                      <p className="text-xs text-muted-foreground mb-1">Avg Uptime</p>
                      <p className="text-lg font-semibold text-blue-600">
                        {(getSiteTrendData.reduce((acc, d) => acc + d.uptime, 0) / getSiteTrendData.length).toFixed(1)}%
                      </p>
                      <p className="text-xs text-muted-foreground">{getSiteTrendData.length} days</p>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-3 text-center">
                      <p className="text-xs text-muted-foreground mb-1">Total Checks</p>
                      <p className="text-lg font-semibold">
                        {getSiteTrendData.reduce((acc, d) => acc + d.checks, 0).toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {getSiteTrendData.reduce((acc, d) => acc + d.online, 0).toLocaleString()} passed
                      </p>
                    </div>
                  </div>
                )}

                {/* Tabs for Daily/Monthly/Quarterly Data Tables */}
                <Tabs value={modalView} onValueChange={(v) => setModalView(v as "daily" | "monthly" | "quarterly")}>
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="daily">Daily Details</TabsTrigger>
                    <TabsTrigger value="monthly">Monthly Summary</TabsTrigger>
                    <TabsTrigger value="quarterly">Quarterly Summary</TabsTrigger>
                  </TabsList>

                  {/* Daily Details Table */}
                  <TabsContent value="daily">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Daily Performance History</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {getSiteTrendData.length > 0 ? (
                          <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
                            <table className="w-full text-sm">
                              <thead className="bg-muted sticky top-0">
                                <tr>
                                  <th className="text-left p-2 font-medium">Date</th>
                                  <th className="text-right p-2 font-medium">Uptime</th>
                                  <th className="text-right p-2 font-medium">Total</th>
                                  <th className="text-right p-2 font-medium">Online</th>
                                  <th className="text-right p-2 font-medium">Offline</th>
                                  <th className="text-center p-2 font-medium">Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {[...getSiteTrendData].reverse().map((day, i) => (
                                  <tr key={i} className="border-b border-border/50">
                                    <td className="p-2">{new Date(day.date).toLocaleDateString()}</td>
                                    <td className="p-2 text-right">
                                      <span className={day.uptime >= 99 ? 'text-green-600' : day.uptime >= 95 ? 'text-amber-600' : 'text-red-600'}>
                                        {day.uptime.toFixed(1)}%
                                      </span>
                                    </td>
                                    <td className="p-2 text-right">{day.checks}</td>
                                    <td className="p-2 text-right text-green-600">{day.online}</td>
                                    <td className="p-2 text-right text-red-600">{day.offline}</td>
                                    <td className="p-2 text-center">
                                      {day.uptime >= 99 ? (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-green-100 text-green-800">Excellent</span>
                                      ) : day.uptime >= 95 ? (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-amber-100 text-amber-800">Good</span>
                                      ) : (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-red-100 text-red-800">Poor</span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <p className="text-center py-8 text-muted-foreground">No daily data available.</p>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* Monthly Summary Table */}
                  <TabsContent value="monthly">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Monthly Performance Summary</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {getSiteMonthlyTrendData.length > 0 ? (
                          <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
                            <table className="w-full text-sm">
                              <thead className="bg-muted sticky top-0">
                                <tr>
                                  <th className="text-left p-2 font-medium">Month</th>
                                  <th className="text-right p-2 font-medium">Uptime</th>
                                  <th className="text-right p-2 font-medium">Total Checks</th>
                                  <th className="text-right p-2 font-medium">Online</th>
                                  <th className="text-right p-2 font-medium">Failed</th>
                                  <th className="text-center p-2 font-medium">Grade</th>
                                </tr>
                              </thead>
                              <tbody>
                                {[...getSiteMonthlyTrendData].reverse().map((month, i) => (
                                  <tr key={i} className="border-b border-border/50">
                                    <td className="p-2 font-medium">{month.date}</td>
                                    <td className="p-2 text-right">
                                      <span className={month.uptime >= 99 ? 'text-green-600 font-semibold' : month.uptime >= 95 ? 'text-amber-600' : 'text-red-600'}>
                                        {month.uptime.toFixed(1)}%
                                      </span>
                                    </td>
                                    <td className="p-2 text-right">{month.checks.toLocaleString()}</td>
                                    <td className="p-2 text-right text-green-600">{month.online.toLocaleString()}</td>
                                    <td className="p-2 text-right text-red-600">{month.offline.toLocaleString()}</td>
                                    <td className="p-2 text-center">
                                      {month.uptime >= 99.9 ? 'A+' : month.uptime >= 99 ? 'A' : month.uptime >= 98 ? 'B' : month.uptime >= 95 ? 'C' : 'D'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <p className="text-center py-8 text-muted-foreground">No monthly data available.</p>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* Quarterly Summary Table */}
                  <TabsContent value="quarterly">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Quarterly Performance Summary</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {getSiteQuarterlyTrendData.length > 0 ? (
                          <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
                            <table className="w-full text-sm">
                              <thead className="bg-muted sticky top-0">
                                <tr>
                                  <th className="text-left p-2 font-medium">Quarter</th>
                                  <th className="text-right p-2 font-medium">Uptime</th>
                                  <th className="text-right p-2 font-medium">Total Checks</th>
                                  <th className="text-right p-2 font-medium">Online</th>
                                  <th className="text-right p-2 font-medium">Failed</th>
                                  <th className="text-center p-2 font-medium">Trend</th>
                                </tr>
                              </thead>
                              <tbody>
                                {[...getSiteQuarterlyTrendData].reverse().map((quarter, i, arr) => {
                                  const prev = arr[i + 1];
                                  const trend = prev ? quarter.uptime - prev.uptime : 0;
                                  return (
                                    <tr key={i} className="border-b border-border/50">
                                      <td className="p-2 font-medium">{quarter.date}</td>
                                      <td className="p-2 text-right">
                                        <span className={quarter.uptime >= 99 ? 'text-green-600 font-semibold' : quarter.uptime >= 95 ? 'text-amber-600' : 'text-red-600'}>
                                          {quarter.uptime.toFixed(1)}%
                                        </span>
                                      </td>
                                      <td className="p-2 text-right">{quarter.checks.toLocaleString()}</td>
                                      <td className="p-2 text-right text-green-600">{quarter.online.toLocaleString()}</td>
                                      <td className="p-2 text-right text-red-600">{quarter.offline.toLocaleString()}</td>
                                      <td className="p-2 text-center">
                                        {trend > 0 ? (
                                          <span className="text-green-600">↗ +{trend.toFixed(1)}%</span>
                                        ) : trend < 0 ? (
                                          <span className="text-red-600">↘ {trend.toFixed(1)}%</span>
                                        ) : (
                                          <span className="text-muted-foreground">→ 0%</span>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <p className="text-center py-8 text-muted-foreground">No quarterly data available.</p>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>
              </div>

              {/* No Data Message */}
              {getSiteTrendData.length === 0 && getSiteMonthlyTrendData.length === 0 && getSiteQuarterlyTrendData.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No data available for this site.</p>
                  <p className="text-sm mt-2">
                    Data is collected daily. Check back after monitoring has been active for a few days.
                  </p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// removed default export to fix TanStack Router bundle size warning
