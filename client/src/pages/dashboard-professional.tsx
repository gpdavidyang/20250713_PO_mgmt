import { FileText, Package, Users, Clock, Building, Plus, AlertCircle, BarChart3, CheckCircle, TrendingUp, ShoppingCart, Activity, FolderTree, ChevronRight, DollarSign, ArrowUp, ArrowDown, Calendar, Eye, ChevronsUpDown } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useDashboardData } from "@/hooks/use-enhanced-queries";
import { useEffect } from "react";
import React from "react";
import { useTheme } from "@/components/ui/theme-provider";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { formatKoreanWon } from "@/lib/utils";

// Import enhanced components
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";

// Import chart components
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart, PieChart, Pie, Cell } from "recharts";

export default function DashboardProfessional() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { actualTheme } = useTheme();

  // Check if dark mode is active - ensure we're getting the correct theme
  const isDarkMode = actualTheme === 'dark' && document.documentElement.classList.contains('dark');

  // Debug: Log theme state
  useEffect(() => {
    console.log('🎨 Theme Debug:', { 
      actualTheme, 
      isDarkMode,
      htmlClasses: document.documentElement.className,
      hasDarkClass: document.documentElement.classList.contains('dark')
    });
  }, [actualTheme, isDarkMode]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      toast({
        title: "Unauthorized", 
        description: "You are logged out. Redirecting to login...",
        variant: "destructive",
      });
      setTimeout(() => {
        navigate("/login");
      }, 500);
      return;
    }
  }, [user, authLoading, toast]);

  // Unified dashboard API call
  const { data: dashboardData, isLoading: dashboardLoading, error: dashboardError } = useDashboardData();
  
  // Extract data from unified response with fallbacks
  const stats = dashboardData?.statistics || {};
  const recentOrders = dashboardData?.recentOrders || [];
  const monthlyStats = dashboardData?.monthlyStats || [];
  const statusStats = dashboardData?.statusStats || [];
  const projectStats = dashboardData?.projectStats || [];
  const categoryStats = dashboardData?.categoryStats || [];

  if (dashboardLoading) {
    return <DashboardSkeleton />;
  }

  if (!user) {
    return null;
  }

  // Professional color palette
  const colors = {
    primary: '#3B82F6',
    primaryLight: '#60A5FA',
    primaryDark: '#2563EB',
    secondary: '#93C5FD',
    accent: '#DBEAFE',
    gray: '#6B7280',
    success: '#10B981',
    warning: '#F59E0B',
    danger: '#EF4444'
  };

  // Transform monthly data for area chart with proper sorting and formatting
  const monthlyChartData = monthlyStats
    .sort((a: any, b: any) => a.month.localeCompare(b.month)) // Sort by YYYY-MM format
    .map((item: any) => {
      const [year, month] = item.month.split('-');
      const currentYear = new Date().getFullYear();
      const isCurrentYear = parseInt(year) === currentYear;
      
      return {
        month: isCurrentYear ? `${month}월` : `${year.substring(2)}.${month}`, // "08월" or "24.08" for different years
        fullMonth: item.month, // Keep full format for debugging
        발주건수: Number(item.count) || 0,
        금액백만원: Math.round(Number(item.amount || item.totalAmount) / 1000000) || 0 // Convert to millions
      };
    });

  // Status distribution for pie chart - filter out zero values and validate data
  const statusChartData = statusStats
    .filter((item: any) => item && Number(item.count) > 0) // Filter out zero or invalid values
    .map((item: any) => ({
      name: item.status === 'pending' ? '승인대기' : 
            item.status === 'approved' ? '승인완료' : 
            item.status === 'sent' ? '발송완료' : 
            item.status === 'completed' ? '완료' :
            item.status === 'draft' ? '임시저장' :
            item.status === 'cancelled' ? '취소됨' : item.status,
      value: Number(item.count),
      color: item.status === 'pending' ? colors.warning :
             item.status === 'approved' ? colors.success :
             item.status === 'sent' ? colors.primary :
             item.status === 'completed' ? colors.primaryDark :
             item.status === 'draft' ? colors.gray :
             item.status === 'cancelled' ? colors.danger : colors.gray,
      status: item.status // Keep original status for debugging
    }));

  // Enhanced debug logging
  console.log('📊 Dashboard Professional - Monthly Data:', {
    original_monthlyStats: monthlyStats,
    transformed_monthlyChartData: monthlyChartData,
    dataLength: monthlyChartData.length
  });
  
  console.log('📊 Dashboard Professional - Status Data:', {
    original_statusStats: statusStats,
    filtered_statusChartData: statusChartData,
    hasOriginalData: statusStats && statusStats.length > 0,
    hasFilteredData: statusChartData && statusChartData.length > 0,
    chartDataLength: statusChartData?.length || 0,
    firstChartItem: statusChartData?.[0] || null
  });

  return (
    <div className="min-h-screen" style={{ backgroundColor: isDarkMode ? '#111827' : '#f9fafb' }}>
      {/* Fixed width container for consistent layout */}
      <div className="max-w-[1366px] mx-auto p-6">
        {/* Professional Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold" style={{ color: isDarkMode ? '#f9fafb' : '#1f2937' }}>대시보드</h1>
              <p className="text-sm mt-1" style={{ color: isDarkMode ? '#9ca3af' : '#6b7280' }}>실시간 발주 현황을 한눈에 확인하세요</p>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/create-order')}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors shadow-sm"
              >
                <Plus className="h-5 w-5" />
                새 발주서
              </button>
              <div className="text-sm" style={{ color: isDarkMode ? '#9ca3af' : '#6b7280' }}>
                마지막 업데이트: {new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        </div>

        {/* KPI Cards - Professional Style */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {/* Total Orders */}
          <div 
            className="rounded-xl shadow-sm p-6 hover:shadow-md transition-shadow"
            style={{ backgroundColor: isDarkMode ? '#1f2937' : '#ffffff' }}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium" style={{ color: isDarkMode ? '#9ca3af' : '#4b5563' }}>총 발주서</p>
                <p className="text-2xl font-bold mt-2" style={{ color: isDarkMode ? '#f3f4f6' : '#111827' }}>{stats.totalOrders || 0}</p>
                <div className="flex items-center mt-2 text-sm">
                  <ArrowUp className="h-4 w-4 text-green-500 mr-1" />
                  <span className="text-green-600">12% 증가</span>
                </div>
              </div>
              <div 
                className="p-3 rounded-lg"
                style={{ backgroundColor: isDarkMode ? 'rgba(30, 58, 138, 0.3)' : '#dbeafe' }}
              >
                <FileText className="h-6 w-6" style={{ color: isDarkMode ? '#60a5fa' : '#2563eb' }} />
              </div>
            </div>
          </div>

          {/* Total Amount */}
          <div 
            className="rounded-xl shadow-sm p-6 hover:shadow-md transition-shadow"
            style={{ backgroundColor: isDarkMode ? '#1f2937' : '#ffffff' }}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium" style={{ color: isDarkMode ? '#9ca3af' : '#4b5563' }}>총 발주 금액</p>
                <p className="text-2xl font-bold mt-2" style={{ color: isDarkMode ? '#60a5fa' : '#2563eb' }}>
                  {formatKoreanWon(stats.totalAmount || 0)}
                </p>
                <div className="flex items-center mt-2 text-sm">
                  <ArrowUp className="h-4 w-4 text-green-500 mr-1" />
                  <span className="text-green-600">8.5% 증가</span>
                </div>
              </div>
              <div 
                className="p-3 rounded-lg"
                style={{ backgroundColor: isDarkMode ? 'rgba(5, 150, 105, 0.3)' : '#d1fae5' }}
              >
                <DollarSign className="h-6 w-6" style={{ color: isDarkMode ? '#34d399' : '#059669' }} />
              </div>
            </div>
          </div>

          {/* Pending Orders */}
          <div 
            className="rounded-xl shadow-sm p-6 hover:shadow-md transition-shadow cursor-pointer" 
            style={{ backgroundColor: isDarkMode ? '#1f2937' : '#ffffff' }}
            onClick={() => navigate('/orders?status=pending')}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium" style={{ color: isDarkMode ? '#9ca3af' : '#4b5563' }}>승인 대기</p>
                <p className="text-2xl font-bold mt-2" style={{ color: isDarkMode ? '#fb923c' : '#ea580c' }}>{stats.pendingOrders || 0}</p>
                <div className="flex items-center mt-2 text-sm">
                  <AlertCircle className="h-4 w-4 text-orange-500 mr-1" />
                  <span className="text-orange-600">즉시 확인 필요</span>
                </div>
              </div>
              <div 
                className="p-3 rounded-lg"
                style={{ backgroundColor: isDarkMode ? 'rgba(194, 65, 12, 0.3)' : '#fed7aa' }}
              >
                <Clock className="h-6 w-6" style={{ color: isDarkMode ? '#fb923c' : '#ea580c' }} />
              </div>
            </div>
          </div>

          {/* Active Projects */}
          <div 
            className="rounded-xl shadow-sm p-6 hover:shadow-md transition-shadow"
            style={{ backgroundColor: isDarkMode ? '#1f2937' : '#ffffff' }}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium" style={{ color: isDarkMode ? '#9ca3af' : '#4b5563' }}>활성 프로젝트</p>
                <p className="text-2xl font-bold mt-2" style={{ color: isDarkMode ? '#f3f4f6' : '#111827' }}>{stats.activeProjects || 0}</p>
                <div className="flex items-center mt-2 text-sm">
                  <ArrowDown className="h-4 w-4 text-gray-400 mr-1" />
                  <span style={{ color: isDarkMode ? '#9ca3af' : '#6b7280' }}>변동 없음</span>
                </div>
              </div>
              <div 
                className="p-3 rounded-lg"
                style={{ backgroundColor: isDarkMode ? 'rgba(107, 33, 168, 0.3)' : '#ede9fe' }}
              >
                <Building className="h-6 w-6" style={{ color: isDarkMode ? '#a855f7' : '#7c3aed' }} />
              </div>
            </div>
          </div>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Monthly Trend - Area Chart */}
          <div 
            className="rounded-xl shadow-sm p-6"
            style={{ backgroundColor: isDarkMode ? '#1f2937' : '#ffffff' }}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold" style={{ color: isDarkMode ? '#f3f4f6' : '#111827' }}>월별 발주 추이</h3>
              <button 
                className="text-sm font-medium transition-colors"
                style={{ color: isDarkMode ? '#60a5fa' : '#2563eb' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = isDarkMode ? '#3b82f6' : '#1d4ed8';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = isDarkMode ? '#60a5fa' : '#2563eb';
                }}
              >
                전체 보기
              </button>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyChartData} margin={{ top: 10, right: 30, left: 20, bottom: 30 }}>
                  <defs>
                    <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={colors.primary} stopOpacity={0.3}/>
                      <stop offset="95%" stopColor={colors.primary} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? '#374151' : '#f0f0f0'} />
                  <XAxis 
                    dataKey="month" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 11, fill: isDarkMode ? '#9CA3AF' : '#6B7280' }}
                    interval={0}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 11, fill: isDarkMode ? '#9CA3AF' : '#6B7280' }}
                    label={{ 
                      value: '발주 건수', 
                      angle: -90, 
                      position: 'insideLeft',
                      style: { textAnchor: 'middle', fill: isDarkMode ? '#9CA3AF' : '#6B7280', fontSize: '12px' }
                    }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: isDarkMode ? '#1f2937' : 'white', 
                      border: isDarkMode ? '1px solid #374151' : '1px solid #e5e7eb',
                      borderRadius: '8px',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                      color: isDarkMode ? '#f9fafb' : '#1f2937'
                    }}
                    formatter={(value: any, name: string) => [`${value}건`, '발주 건수']}
                    labelFormatter={(label: string) => `${label} 발주 현황`}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="발주건수" 
                    stroke={colors.primary} 
                    fillOpacity={1} 
                    fill="url(#colorAmount)" 
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Status Distribution - Modern Donut Chart */}
          <div 
            className="rounded-xl shadow-sm p-6"
            style={{ backgroundColor: isDarkMode ? '#1f2937' : '#ffffff' }}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold" style={{ color: isDarkMode ? '#f3f4f6' : '#111827' }}>발주 상태 분포</h3>
              <button 
                className="text-sm font-medium transition-colors"
                style={{ color: isDarkMode ? '#60a5fa' : '#2563eb' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = isDarkMode ? '#3b82f6' : '#1d4ed8';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = isDarkMode ? '#60a5fa' : '#2563eb';
                }}
              >
                상세 보기
              </button>
            </div>
            {statusStats && statusStats.length > 0 && statusChartData.length > 0 ? (
              <div className="h-64 flex items-center">
                <div className="w-1/2 h-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart width={200} height={200}>
                      <Pie
                        data={statusChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={90}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {statusChartData.map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip 
                        formatter={(value: any, name: any) => [`${value}건`, name]}
                        contentStyle={{ 
                          backgroundColor: isDarkMode ? '#1f2937' : 'white', 
                          border: isDarkMode ? '1px solid #374151' : '1px solid #e5e7eb',
                          borderRadius: '8px',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                          color: isDarkMode ? '#f9fafb' : '#1f2937'
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="w-1/2 pl-6">
                  {statusChartData.map((item: any, index: number) => (
                    <div key={index} className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }}></div>
                        <span className="text-sm font-medium" style={{ color: isDarkMode ? '#d1d5db' : '#374151' }}>{item.name}</span>
                      </div>
                      <span className="text-sm font-semibold" style={{ color: isDarkMode ? '#f3f4f6' : '#111827' }}>{item.value}건</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center" style={{ color: isDarkMode ? '#9ca3af' : '#6b7280' }}>
                <div className="text-center">
                  <Package className="h-12 w-12 mx-auto mb-2" style={{ color: isDarkMode ? '#4b5563' : '#d1d5db' }} />
                  <p className="text-sm">상태별 데이터가 없습니다.</p>
                  <p className="text-xs mt-1" style={{ color: isDarkMode ? '#6b7280' : '#9ca3af' }}>발주서를 생성하면 차트가 표시됩니다.</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Recent Orders Table */}
        <div 
          className="rounded-xl shadow-sm"
          style={{ backgroundColor: isDarkMode ? '#1f2937' : '#ffffff' }}
        >
          <div 
            className="p-6 border-b"
            style={{ borderColor: isDarkMode ? '#374151' : '#e5e7eb' }}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold" style={{ color: isDarkMode ? '#f3f4f6' : '#111827' }}>최근 발주 내역</h3>
              <button 
                onClick={() => navigate('/orders')}
                className="text-sm font-medium flex items-center gap-1 transition-colors"
                style={{ color: isDarkMode ? '#60a5fa' : '#2563eb' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = isDarkMode ? '#3b82f6' : '#1d4ed8';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = isDarkMode ? '#60a5fa' : '#2563eb';
                }}
              >
                전체 보기
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead style={{ backgroundColor: isDarkMode ? '#374151' : '#f9fafb' }}>
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: isDarkMode ? '#9ca3af' : '#6b7280' }}>
                    <button 
                      className={`flex items-center gap-1 transition-colors ${isDarkMode ? 'hover:text-gray-300' : 'hover:text-gray-700'}`}
                    >
                      발주번호
                      <ChevronsUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: isDarkMode ? '#9ca3af' : '#6b7280' }}>
                    <button 
                      className={`flex items-center gap-1 transition-colors ${isDarkMode ? 'hover:text-gray-300' : 'hover:text-gray-700'}`}
                    >
                      거래처
                      <ChevronsUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: isDarkMode ? '#9ca3af' : '#6b7280' }}>
                    <button 
                      className={`flex items-center gap-1 transition-colors ${isDarkMode ? 'hover:text-gray-300' : 'hover:text-gray-700'}`}
                    >
                      프로젝트
                      <ChevronsUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: isDarkMode ? '#9ca3af' : '#6b7280' }}>
                    <button 
                      className={`flex items-center gap-1 transition-colors ${isDarkMode ? 'hover:text-gray-300' : 'hover:text-gray-700'}`}
                    >
                      금액
                      <ChevronsUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: isDarkMode ? '#9ca3af' : '#6b7280' }}>
                    <button 
                      className={`flex items-center gap-1 transition-colors ${isDarkMode ? 'hover:text-gray-300' : 'hover:text-gray-700'}`}
                    >
                      상태
                      <ChevronsUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider" style={{ color: isDarkMode ? '#9ca3af' : '#6b7280' }}>액션</th>
                </tr>
              </thead>
              <tbody 
                style={{ 
                  backgroundColor: isDarkMode ? '#1f2937' : '#ffffff'
                }}
              >
                {recentOrders.slice(0, 5).map((order: any) => (
                  <tr 
                    key={order.id} 
                    className="transition-colors"
                    style={{ 
                      backgroundColor: 'transparent',
                      borderBottom: `1px solid ${isDarkMode ? '#374151' : '#e5e7eb'}`
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = isDarkMode ? '#374151' : '#f9fafb';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium" style={{ color: isDarkMode ? '#f3f4f6' : '#111827' }}>
                      {order.orderNumber}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm" style={{ color: isDarkMode ? '#d1d5db' : '#374151' }}>
                      {order.vendor?.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm" style={{ color: isDarkMode ? '#d1d5db' : '#374151' }}>
                      {order.project?.projectName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold" style={{ color: isDarkMode ? '#60a5fa' : '#2563eb' }}>
                      {formatKoreanWon(order.totalAmount)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span 
                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                        style={{
                          backgroundColor: order.status === 'pending' ? (isDarkMode ? 'rgba(180, 83, 9, 0.3)' : '#fef3c7') :
                                         order.status === 'approved' ? (isDarkMode ? 'rgba(5, 150, 105, 0.3)' : '#d1fae5') :
                                         order.status === 'sent' ? (isDarkMode ? 'rgba(30, 58, 138, 0.3)' : '#dbeafe') :
                                         (isDarkMode ? '#374151' : '#f3f4f6'),
                          color: order.status === 'pending' ? (isDarkMode ? '#fbbf24' : '#d97706') :
                                order.status === 'approved' ? (isDarkMode ? '#34d399' : '#059669') :
                                order.status === 'sent' ? (isDarkMode ? '#60a5fa' : '#2563eb') :
                                (isDarkMode ? '#d1d5db' : '#374151')
                        }}
                      >
                        {order.status === 'pending' ? '승인대기' :
                         order.status === 'approved' ? '승인완료' :
                         order.status === 'sent' ? '발송완료' : order.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <button
                        onClick={() => navigate(`/orders/${order.id}`)}
                        className="font-medium text-sm transition-colors"
                        style={{ color: isDarkMode ? '#60a5fa' : '#2563eb' }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.color = isDarkMode ? '#3b82f6' : '#1d4ed8';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.color = isDarkMode ? '#60a5fa' : '#2563eb';
                        }}
                      >
                        상세보기
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
          <button
            onClick={() => navigate('/orders?status=pending')}
            className="rounded-lg p-4 hover:shadow-md transition-shadow flex items-center gap-3 border"
            style={{ 
              backgroundColor: isDarkMode ? '#1f2937' : '#ffffff',
              borderColor: isDarkMode ? '#374151' : '#e5e7eb'
            }}
          >
            <div 
              className="p-2 rounded-lg"
              style={{ backgroundColor: isDarkMode ? 'rgba(194, 65, 12, 0.3)' : '#fed7aa' }}
            >
              <AlertCircle className="h-5 w-5" style={{ color: isDarkMode ? '#fb923c' : '#ea580c' }} />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium" style={{ color: isDarkMode ? '#f3f4f6' : '#111827' }}>승인 대기 확인</p>
              <p className="text-xs" style={{ color: isDarkMode ? '#9ca3af' : '#6b7280' }}>{stats.pendingOrders || 0}건 대기중</p>
            </div>
          </button>

          <button
            onClick={() => navigate('/vendors')}
            className="rounded-lg p-4 hover:shadow-md transition-shadow flex items-center gap-3 border"
            style={{ 
              backgroundColor: isDarkMode ? '#1f2937' : '#ffffff',
              borderColor: isDarkMode ? '#374151' : '#e5e7eb'
            }}
          >
            <div 
              className="p-2 rounded-lg"
              style={{ backgroundColor: isDarkMode ? 'rgba(30, 58, 138, 0.3)' : '#dbeafe' }}
            >
              <Users className="h-5 w-5" style={{ color: isDarkMode ? '#60a5fa' : '#2563eb' }} />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium" style={{ color: isDarkMode ? '#f3f4f6' : '#111827' }}>거래처 관리</p>
              <p className="text-xs" style={{ color: isDarkMode ? '#9ca3af' : '#6b7280' }}>{stats.activeVendors || 0}개 활성</p>
            </div>
          </button>

          <button
            onClick={() => navigate('/projects')}
            className="rounded-lg p-4 hover:shadow-md transition-shadow flex items-center gap-3 border"
            style={{ 
              backgroundColor: isDarkMode ? '#1f2937' : '#ffffff',
              borderColor: isDarkMode ? '#374151' : '#e5e7eb'
            }}
          >
            <div 
              className="p-2 rounded-lg"
              style={{ backgroundColor: isDarkMode ? 'rgba(107, 33, 168, 0.3)' : '#ede9fe' }}
            >
              <Building className="h-5 w-5" style={{ color: isDarkMode ? '#a855f7' : '#7c3aed' }} />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium" style={{ color: isDarkMode ? '#f3f4f6' : '#111827' }}>현장 관리</p>
              <p className="text-xs" style={{ color: isDarkMode ? '#9ca3af' : '#6b7280' }}>{stats.activeProjects || 0}개 진행중</p>
            </div>
          </button>

          <button
            onClick={() => navigate('/reports')}
            className="rounded-lg p-4 hover:shadow-md transition-shadow flex items-center gap-3 border"
            style={{ 
              backgroundColor: isDarkMode ? '#1f2937' : '#ffffff',
              borderColor: isDarkMode ? '#374151' : '#e5e7eb'
            }}
          >
            <div 
              className="p-2 rounded-lg"
              style={{ backgroundColor: isDarkMode ? 'rgba(5, 150, 105, 0.3)' : '#d1fae5' }}
            >
              <BarChart3 className="h-5 w-5" style={{ color: isDarkMode ? '#34d399' : '#059669' }} />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium" style={{ color: isDarkMode ? '#f3f4f6' : '#111827' }}>보고서 생성</p>
              <p className="text-xs" style={{ color: isDarkMode ? '#9ca3af' : '#6b7280' }}>상세 분석</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}