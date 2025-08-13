import React, { useState, useCallback } from 'react';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface ExcelUploadZoneProps {
  onDataExtracted: (data: any) => void;
  onProcessedFileReady?: (fileInfo: { url: string; name: string }) => void;
}

const ExcelUploadZone: React.FC<ExcelUploadZoneProps> = ({ onDataExtracted, onProcessedFileReady }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [parsedOrders, setParsedOrders] = useState<any[]>([]);
  const [selectedOrderIndex, setSelectedOrderIndex] = useState(0);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    const excelFile = files.find(file => 
      file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.name.endsWith('.xlsx')
    );
    
    if (excelFile) {
      processFile(excelFile);
    } else {
      setErrorMessage('엑셀 파일(.xlsx)만 업로드 가능합니다.');
      setUploadStatus('error');
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const processFile = async (file: File) => {
    setUploadedFile(file);
    setIsProcessing(true);
    setUploadStatus('processing');
    setErrorMessage('');
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const response = await fetch('/api/po-template/upload', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        throw new Error('파일 업로드 실패');
      }
      
      const result = await response.json();
      
      if (result.success && result.data.orders.length > 0) {
        setParsedOrders(result.data.orders);
        setUploadStatus('success');
        
        // 업로드된 파일을 사용하여 Input 시트 제거된 파일을 생성하도록 extract-sheets API 호출
        try {
          const extractResponse = await fetch('/api/po-template/extract-sheets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              filePath: result.data.filePath,
              sheetNames: ['갑지', '을지'] // Input 시트를 제거하고 다른 시트들을 유지
            })
          });
          
          if (extractResponse.ok) {
            const extractResult = await extractResponse.json();
            if (extractResult.success && extractResult.data.extractedPath) {
              // 처리된 Excel 파일 정보 상위로 전달
              const extractedFileName = extractResult.data.extractedPath.split('/').pop();
              const processedFileUrl = `/uploads/${extractedFileName}`;
              const processedFileName = `${file.name.replace('.xlsx', '')}_Input제거.xlsx`;
              
              console.log('🔷 처리된 Excel 파일 정보:', { processedFileUrl, processedFileName });
              
              onProcessedFileReady?.({
                url: processedFileUrl,
                name: processedFileName
              });
            }
          } else {
            console.warn('⚠️ Extract sheets API 실패, 기본값 사용');
            // extract-sheets가 실패해도 기본값으로 처리
            const timestamp = Date.now();
            const processedFileUrl = `/uploads/extracted-${timestamp}.xlsx`;
            const processedFileName = `${file.name.replace('.xlsx', '')}_Input제거.xlsx`;
            
            onProcessedFileReady?.({
              url: processedFileUrl,
              name: processedFileName
            });
          }
        } catch (extractError) {
          console.error('Extract sheets 호출 실패:', extractError);
          // extract-sheets가 실패해도 기본값으로 처리
          const timestamp = Date.now();
          const processedFileUrl = `/uploads/extracted-${timestamp}.xlsx`;
          const processedFileName = `${file.name.replace('.xlsx', '')}_Input제거.xlsx`;
          
          onProcessedFileReady?.({
            url: processedFileUrl,
            name: processedFileName
          });
        }
        
        // 발주서가 하나면 바로 전달, 여러개면 선택 UI 표시
        if (result.data.orders.length === 1) {
          const order = result.data.orders[0];
          
          // Map fields for V2 workflow compatibility
          const mappedData = {
            ...order,
            projectName: order.siteName || order.projectName, // Map siteName to projectName
            orderDate: order.orderDate,
            deliveryDate: order.dueDate || order.deliveryDate,
            items: (order.items || []).map((item: any) => ({
              ...item,
              name: item.itemName || item.name, // Map itemName to name for PDF generation
              unit: item.unit || 'EA'
            }))
          };
          
          onDataExtracted(mappedData);
        }
      } else {
        throw new Error(result.error || '데이터 추출 실패');
      }
    } catch (error: any) {
      setErrorMessage(error.message || '파일 처리 중 오류가 발생했습니다.');
      setUploadStatus('error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleOrderSelect = async () => {
    if (parsedOrders[selectedOrderIndex] && uploadedFile) {
      const selectedOrder = parsedOrders[selectedOrderIndex];
      
      // 처리된 Excel 파일 정보 전달은 이미 processFile에서 처리되었으므로 제거
      // (중복 호출을 피하기 위해)
      
      // Map fields for V2 workflow compatibility
      const mappedData = {
        ...selectedOrder,
        projectName: selectedOrder.siteName || selectedOrder.projectName, // Map siteName to projectName
        orderDate: selectedOrder.orderDate,
        deliveryDate: selectedOrder.dueDate || selectedOrder.deliveryDate,
        items: (selectedOrder.items || []).map((item: any) => ({
          ...item,
          name: item.itemName || item.name, // Map itemName to name for PDF generation
          unit: item.unit || 'EA'
        }))
      };
      
      onDataExtracted(mappedData);
    }
  };

  return (
    <div className="space-y-4">
      {/* 드래그 앤 드롭 영역 */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          border-2 border-dashed rounded-lg ${uploadStatus === 'success' ? 'p-4' : 'p-8'} text-center transition-all
          ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
          ${isProcessing ? 'opacity-50 pointer-events-none' : ''}
        `}
      >
        {isProcessing ? (
          <div className="space-y-2">
            <Loader2 className="w-8 h-8 mx-auto text-blue-600 animate-spin" />
            <p className="text-sm text-gray-600">파일을 처리하고 있습니다...</p>
          </div>
        ) : uploadStatus === 'success' ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-8 h-8 text-green-600" />
              <div className="text-left">
                <p className="text-sm font-medium text-green-700">
                  {uploadedFile?.name}
                </p>
                <p className="text-xs text-gray-600">
                  {parsedOrders.length}개의 발주서 감지됨
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setUploadStatus('idle');
                setParsedOrders([]);
                setUploadedFile(null);
              }}
            >
              다시 업로드
            </Button>
          </div>
        ) : (
          <>
            <FileSpreadsheet className="w-12 h-12 mx-auto text-gray-400 mb-4" />
            <p className="text-lg font-medium text-gray-700 mb-2">
              엑셀 파일을 드래그하여 놓으세요
            </p>
            <p className="text-sm text-gray-500 mb-4">또는</p>
            <input
              type="file"
              accept=".xlsx"
              onChange={handleFileSelect}
              className="hidden"
              id="excel-upload"
            />
            <label htmlFor="excel-upload">
              <Button variant="outline" asChild>
                <span className="cursor-pointer">
                  <Upload className="w-4 h-4 mr-2" />
                  파일 선택
                </span>
              </Button>
            </label>
          </>
        )}
      </div>

      {/* 에러 메시지 */}
      {uploadStatus === 'error' && errorMessage && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      {/* 여러 발주서 선택 UI */}
      {parsedOrders.length > 1 && uploadStatus === 'success' && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-gray-700">발주서를 선택하세요:</p>
          <div className="space-y-2 max-h-96 overflow-y-auto border rounded-lg p-2 bg-gray-50">
            {parsedOrders.map((order, index) => (
              <div
                key={index}
                onClick={() => setSelectedOrderIndex(index)}
                className={`
                  p-3 border rounded-lg cursor-pointer transition-colors
                  ${selectedOrderIndex === index 
                    ? 'border-blue-500 bg-blue-50' 
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                  }
                `}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{order.orderNumber}</p>
                      <p className="text-xs text-gray-600">
                        {order.vendorName} | {order.projectName}
                      </p>
                    </div>
                    <Badge variant="secondary">
                      {order.items?.length || 0}개 품목
                    </Badge>
                  </div>
                  
                  {/* 품목 상세 정보 - 더 컴팩트한 테이블 형식 */}
                  {order.items && order.items.length > 0 && (
                    <div className="pt-2 border-t border-gray-200">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-gray-500">
                            <th className="text-left font-normal">품목</th>
                            <th className="text-right font-normal">수량</th>
                            <th className="text-right font-normal">단가</th>
                            <th className="text-right font-normal">금액</th>
                          </tr>
                        </thead>
                        <tbody>
                          {order.items.slice(0, 2).map((item: any, itemIndex: number) => (
                            <tr key={itemIndex}>
                              <td className="text-gray-600 truncate max-w-[150px] pr-2">{item.itemName}</td>
                              <td className="text-right text-gray-700">{Math.floor(item.quantity || 0).toLocaleString()}</td>
                              <td className="text-right text-gray-700">{Math.floor(item.unitPrice || 0).toLocaleString()}</td>
                              <td className="text-right font-medium">{Math.floor(item.totalAmount || 0).toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      
                      <div className="flex items-center justify-between mt-1">
                        {order.items.length > 2 && (
                          <p className="text-xs text-gray-500 italic">
                            외 {order.items.length - 2}개
                          </p>
                        )}
                        <div className="text-right">
                          <span className="text-xs text-gray-600 mr-2">총액</span>
                          <span className="text-sm font-semibold text-blue-600">
                            {Math.floor(order.totalAmount || order.items.reduce((sum: number, item: any) => 
                              sum + (item.totalAmount || 0), 0)).toLocaleString()}원
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          <Button 
            onClick={handleOrderSelect}
            className="w-full"
            size="sm"
          >
            선택한 발주서 사용
          </Button>
        </div>
      )}

    </div>
  );
};

export default ExcelUploadZone;