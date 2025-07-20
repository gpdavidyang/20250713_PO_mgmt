import nodemailer from 'nodemailer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { convertExcelToPdf } from './excel-to-pdf';
import { POTemplateProcessor } from './po-template-processor';
import { removeAllInputSheets } from './excel-input-sheet-remover';

// ES 모듈 환경에서 __dirname 대체
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface EmailAttachment {
  filename: string;
  path: string;
  contentType?: string;
}

export interface POEmailOptions {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  orderNumber?: string;
  vendorName?: string;
  orderDate?: string;
  dueDate?: string;
  totalAmount?: number;
  additionalMessage?: string;
}

export class POEmailService {
  private transporter: nodemailer.Transporter;
  private isTestMode: boolean;

  constructor() {
    // 테스트 모드 확인: SMTP 비밀번호가 설정되지 않았거나 기본값인 경우
    this.isTestMode = !process.env.SMTP_PASS || 
                      process.env.SMTP_PASS === 'your_naver_password_here' ||
                      process.env.NODE_ENV === 'test';
    
    if (this.isTestMode) {
      console.log('📧 이메일 서비스 테스트 모드 실행 중 (실제 이메일 발송 안함)');
      // 테스트 모드에서는 nodemailer 테스트 계정 사용
      this.transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: 'test@example.com',
          pass: 'test'
        }
      });
    } else {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.naver.com',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: false, // true for 465, false for other ports
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        },
        tls: {
          rejectUnauthorized: false
        }
      });
    }
  }

  /**
   * Input 시트만 제거한 원본 형식 유지 엑셀과 PDF로 첨부하여 이메일 발송
   * 기존 방식과 달리 엑셀 파일의 원본 형식(테두리, 병합, 색상 등)을 그대로 유지
   */
  async sendPOWithOriginalFormat(
    originalFilePath: string,
    emailOptions: POEmailOptions & { 
      additionalAttachments?: Array<{
        filename: string;
        originalName: string;
        path: string;
      }>;
    }
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const timestamp = Date.now();
      const uploadsDir = path.join(__dirname, '../../uploads');
      
      // 1. 고급 방식으로 Input 시트만 제거하고 원본 형식 완벽 유지
      const processedPath = path.join(uploadsDir, `po-advanced-format-${timestamp}.xlsx`);
      const removeResult = await removeAllInputSheets(
        originalFilePath,
        processedPath
      );

      if (!removeResult.success) {
        return {
          success: false,
          error: `Input 시트 제거 실패: ${removeResult.error}`
        };
      }

      console.log(`📄 고급 형식 보존 파일 생성: ${processedPath}`);
      console.log(`🎯 사용된 방법: ${removeResult.method} (${removeResult.methodDetails?.quality || 'unknown'} 품질)`);
      console.log(`📋 남은 시트: ${removeResult.remainingSheets.join(', ')}`);

      // 2. PDF 변환 (남은 모든 시트)
      const pdfPath = path.join(uploadsDir, `po-advanced-format-${timestamp}.pdf`);
      const pdfResult = await convertExcelToPdf(processedPath, pdfPath, removeResult.remainingSheets);

      if (!pdfResult.success) {
        console.warn(`⚠️ PDF 변환 실패: ${pdfResult.error}, Excel 파일만 첨부합니다.`);
      }

      // 3. 첨부파일 준비
      const attachments: EmailAttachment[] = [];
      
      // Excel 파일 첨부 (원본 형식 유지)
      if (fs.existsSync(processedPath)) {
        attachments.push({
          filename: `발주서_${emailOptions.orderNumber || timestamp}.xlsx`,
          path: processedPath,
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        });
        console.log(`📎 Excel 첨부파일 추가: 발주서_${emailOptions.orderNumber || timestamp}.xlsx`);
      }

      // PDF 파일 첨부 (변환 성공한 경우에만)
      if (pdfResult.success && fs.existsSync(pdfPath)) {
        attachments.push({
          filename: `발주서_${emailOptions.orderNumber || timestamp}.pdf`,
          path: pdfPath,
          contentType: 'application/pdf'
        });
        console.log(`📎 PDF 첨부파일 추가: 발주서_${emailOptions.orderNumber || timestamp}.pdf`);
      }

      // 추가 첨부파일 처리
      if (emailOptions.additionalAttachments && emailOptions.additionalAttachments.length > 0) {
        for (const additionalFile of emailOptions.additionalAttachments) {
          const additionalFilePath = path.join(__dirname, '../../', additionalFile.path);
          if (fs.existsSync(additionalFilePath)) {
            attachments.push({
              filename: additionalFile.originalName,
              path: additionalFilePath,
              contentType: this.getContentType(additionalFile.originalName)
            });
            console.log(`📎 추가 첨부파일 추가: ${additionalFile.originalName}`);
          } else {
            console.warn(`⚠️ 추가 첨부파일을 찾을 수 없습니다: ${additionalFilePath}`);
          }
        }
      }

      if (attachments.length === 0) {
        return {
          success: false,
          error: '첨부할 파일이 생성되지 않았습니다.'
        };
      }

      // 4. 이메일 내용 생성
      const emailContent = this.generateEmailContent(emailOptions);

      // 5. 이메일 발송
      const result = await this.sendEmail({
        to: emailOptions.to,
        cc: emailOptions.cc,
        bcc: emailOptions.bcc,
        subject: emailOptions.subject || `발주서 전송 - ${emailOptions.orderNumber || ''}`,
        html: emailContent,
        attachments
      });

      // 6. 임시 파일 정리
      this.cleanupTempFiles([processedPath, pdfPath]);

      if (result.success) {
        console.log(`✅ 원본 형식 유지 이메일 발송 성공: ${emailOptions.to}`);
      }

      return result;

    } catch (error) {
      console.error('❌ 원본 형식 유지 이메일 발송 오류:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * [기존 방식] 갑지/을지 시트를 Excel과 PDF로 첨부하여 이메일 발송
   * @deprecated 형식 손상 문제로 sendPOWithOriginalFormat 사용 권장
   */
  async sendPOWithAttachments(
    originalFilePath: string,
    emailOptions: POEmailOptions
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const timestamp = Date.now();
      const uploadsDir = path.join(__dirname, '../../uploads');
      
      // 1. 갑지/을지 시트 추출
      const extractedPath = path.join(uploadsDir, `po-sheets-${timestamp}.xlsx`);
      const extractResult = POTemplateProcessor.extractSheetsToFile(
        originalFilePath,
        extractedPath,
        ['갑지', '을지']
      );

      if (!extractResult.success) {
        return {
          success: false,
          error: `시트 추출 실패: ${extractResult.error}`
        };
      }

      // 2. PDF 변환
      const pdfPath = path.join(uploadsDir, `po-sheets-${timestamp}.pdf`);
      const pdfResult = await convertExcelToPdf(extractedPath, pdfPath, ['갑지', '을지']);

      if (!pdfResult.success) {
        return {
          success: false,
          error: `PDF 변환 실패: ${pdfResult.error}`
        };
      }

      // 3. 첨부파일 준비
      const attachments: EmailAttachment[] = [];
      
      // Excel 파일 첨부
      if (fs.existsSync(extractedPath)) {
        attachments.push({
          filename: `발주서_${emailOptions.orderNumber || timestamp}.xlsx`,
          path: extractedPath,
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        });
      }

      // PDF 파일 첨부
      if (fs.existsSync(pdfPath)) {
        attachments.push({
          filename: `발주서_${emailOptions.orderNumber || timestamp}.pdf`,
          path: pdfPath,
          contentType: 'application/pdf'
        });
      }

      // 4. 이메일 내용 생성
      const emailContent = this.generateEmailContent(emailOptions);

      // 5. 이메일 발송
      const result = await this.sendEmail({
        to: emailOptions.to,
        cc: emailOptions.cc,
        bcc: emailOptions.bcc,
        subject: emailOptions.subject,
        html: emailContent,
        attachments
      });

      // 6. 임시 파일 정리
      this.cleanupTempFiles([extractedPath, pdfPath]);

      return result;

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * 기본 이메일 발송
   */
  async sendEmail(options: {
    to: string | string[];
    cc?: string | string[];
    bcc?: string | string[];
    subject: string;
    text?: string;
    html?: string;
    attachments?: EmailAttachment[];
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      // 테스트 모드에서는 실제 이메일 발송 없이 성공 처리
      if (this.isTestMode) {
        const recipients = Array.isArray(options.to) ? options.to.join(', ') : options.to;
        console.log(`📧 [테스트 모드] 이메일 발송 시뮬레이션: ${recipients}`);
        console.log(`📧 [테스트 모드] 제목: ${options.subject}`);
        console.log(`📧 [테스트 모드] 첨부파일: ${options.attachments?.length || 0}개`);
        
        // 시뮬레이션 지연 (실제 이메일 발송과 비슷한 시간)
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        return {
          success: true,
          messageId: `test_message_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        };
      }

      const info = await this.transporter.sendMail({
        from: `"발주 시스템" <${process.env.SMTP_USER}>`,
        to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
        cc: options.cc ? (Array.isArray(options.cc) ? options.cc.join(', ') : options.cc) : undefined,
        bcc: options.bcc ? (Array.isArray(options.bcc) ? options.bcc.join(', ') : options.bcc) : undefined,
        subject: options.subject,
        text: options.text,
        html: options.html,
        attachments: options.attachments?.map(att => ({
          filename: att.filename,
          path: att.path,
          contentType: att.contentType
        }))
      });

      return {
        success: true,
        messageId: info.messageId
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * 이메일 내용 미리보기 생성 (공개 메소드)
   */
  generateEmailPreview(options: POEmailOptions): string {
    return this.generateEmailContent(options);
  }

  /**
   * 이메일 내용 생성
   */
  private generateEmailContent(options: POEmailOptions): string {
    const formatCurrency = (amount: number) => {
      return new Intl.NumberFormat('ko-KR', {
        style: 'currency',
        currency: 'KRW'
      }).format(amount);
    };

    const formatDate = (dateString: string) => {
      try {
        const date = new Date(dateString);
        return date.toLocaleDateString('ko-KR', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
      } catch {
        return dateString;
      }
    };

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body {
              font-family: 'Malgun Gothic', Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            
            .header {
              background-color: #007bff;
              color: white;
              padding: 20px;
              border-radius: 8px 8px 0 0;
              text-align: center;
            }
            
            .content {
              background-color: #f8f9fa;
              padding: 30px;
              border-radius: 0 0 8px 8px;
            }
            
            .info-table {
              width: 100%;
              border-collapse: collapse;
              margin: 20px 0;
            }
            
            .info-table th,
            .info-table td {
              border: 1px solid #ddd;
              padding: 12px;
              text-align: left;
            }
            
            .info-table th {
              background-color: #e9ecef;
              font-weight: bold;
              width: 30%;
            }
            
            .attachments {
              background-color: #e7f3ff;
              padding: 15px;
              border-radius: 5px;
              margin: 20px 0;
            }
            
            .footer {
              margin-top: 30px;
              padding-top: 20px;
              border-top: 1px solid #ddd;
              font-size: 12px;
              color: #666;
              text-align: center;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>📋 발주서 송부</h1>
            <p>구매 발주 관리 시스템</p>
          </div>
          
          <div class="content">
            <p>안녕하세요,</p>
            <p>발주서를 송부드립니다. 첨부된 파일을 확인하여 주시기 바랍니다.</p>
            
            ${options.orderNumber ? `
              <table class="info-table">
                <tr>
                  <th>발주번호</th>
                  <td>${options.orderNumber}</td>
                </tr>
                ${options.vendorName ? `
                  <tr>
                    <th>거래처명</th>
                    <td>${options.vendorName}</td>
                  </tr>
                ` : ''}
                ${options.orderDate ? `
                  <tr>
                    <th>발주일자</th>
                    <td>${formatDate(options.orderDate)}</td>
                  </tr>
                ` : ''}
                ${options.dueDate ? `
                  <tr>
                    <th>납기일자</th>
                    <td>${formatDate(options.dueDate)}</td>
                  </tr>
                ` : ''}
                ${options.totalAmount ? `
                  <tr>
                    <th>총 금액</th>
                    <td><strong>${formatCurrency(options.totalAmount)}</strong></td>
                  </tr>
                ` : ''}
              </table>
            ` : ''}
            
            <div class="attachments">
              <h3>📎 첨부파일</h3>
              <ul>
                <li>발주서.xlsx (Excel 파일)</li>
                <li>발주서.pdf (PDF 파일)</li>
              </ul>
              <p><small>* 갑지와 을지 시트가 포함되어 있습니다.</small></p>
            </div>
            
            ${options.additionalMessage ? `
              <div style="background-color: #fff3cd; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <h3>📝 추가 안내사항</h3>
                <p>${options.additionalMessage}</p>
              </div>
            ` : ''}
            
            <p>
              발주서 검토 후 확인 회신 부탁드립니다.<br>
              문의사항이 있으시면 언제든지 연락주시기 바랍니다.
            </p>
            
            <p>감사합니다.</p>
          </div>
          
          <div class="footer">
            <p>
              이 메일은 구매 발주 관리 시스템에서 자동으로 발송되었습니다.<br>
              발송 시간: ${new Date().toLocaleString('ko-KR')}
            </p>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * 파일 확장자에 따른 Content-Type 결정
   */
  private getContentType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const contentTypes: { [key: string]: string } = {
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.txt': 'text/plain',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif'
    };
    
    return contentTypes[ext] || 'application/octet-stream';
  }

  /**
   * 임시 파일 정리
   */
  private cleanupTempFiles(filePaths: string[]): void {
    filePaths.forEach(filePath => {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (error) {
        console.error(`파일 정리 실패: ${filePath}`, error);
      }
    });
  }

  /**
   * 이메일 연결 테스트
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.transporter.verify();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}