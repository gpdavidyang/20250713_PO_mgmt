import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { POTemplateProcessorMock } from '../utils/po-template-processor-mock.js';
import { MockDB } from '../utils/mock-db.js';
import { POEmailServiceMock } from '../utils/po-email-service-mock.js';
import { convertExcelToPdfMock } from '../utils/excel-to-pdf-mock.js';
import { POTemplateValidator } from '../utils/po-template-validator.js';
import { db } from '../db.js';
import { purchaseOrders, purchaseOrderItems, vendors, projects } from '@shared/schema';
import { eq } from 'drizzle-orm';

const router = Router();

// ES modules에서 __dirname 정의
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 파일 업로드 설정
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const extension = path.extname(originalName);
    const basename = path.basename(originalName, extension);
    cb(null, `${timestamp}-${basename}${extension}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel'
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Excel 파일만 업로드 가능합니다.'));
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

// 인증 미들웨어
const requireAuth = (req: any, res: any, next: any) => {
  req.user = { id: 'test_admin_001' };
  next();
};

/**
 * 실제 DB 연결 상태 확인
 */
router.get('/db-status', requireAuth, async (req: any, res) => {
  try {
    if (!db) {
      return res.json({
        success: false,
        message: 'DB 연결 없음 - Mock DB 사용',
        usingMockDB: true
      });
    }

    // DB 연결 테스트
    const testResult = await db.select().from(vendors).limit(1);
    
    res.json({
      success: true,
      message: '실제 DB 연결 성공',
      usingMockDB: false,
      vendorCount: testResult.length
    });
    
  } catch (error) {
    console.error('DB 상태 확인 오류:', error);
    res.json({
      success: false,
      message: 'DB 연결 실패 - Mock DB로 폴백',
      usingMockDB: true,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * PO Template 파일 업로드 및 파싱 (유효성 검사 포함)
 */
router.post('/upload', requireAuth, upload.single('file'), async (req: any, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '파일이 업로드되지 않았습니다.' });
    }

    const filePath = req.file.path;
    
    // 1. 빠른 유효성 검사
    const quickValidation = await POTemplateValidator.quickValidate(filePath);
    if (!quickValidation.isValid) {
      fs.unlinkSync(filePath);
      return res.status(400).json({ 
        error: '파일 유효성 검사 실패', 
        details: quickValidation.errors.join(', '),
        validation: quickValidation
      });
    }

    // 2. Input 시트 파싱
    const parseResult = POTemplateProcessorMock.parseInputSheet(filePath);
    
    if (!parseResult.success) {
      fs.unlinkSync(filePath);
      return res.status(400).json({ 
        error: '파싱 실패', 
        details: parseResult.error 
      });
    }

    // 3. 상세 유효성 검사
    const detailedValidation = await POTemplateValidator.validatePOTemplateFile(filePath);
    
    res.json({
      success: true,
      message: '파일 파싱 완료',
      data: {
        fileName: req.file.originalname,
        filePath,
        totalOrders: parseResult.totalOrders,
        totalItems: parseResult.totalItems,
        orders: parseResult.orders,
        validation: detailedValidation
      }
    });

  } catch (error) {
    console.error('PO Template 업로드 오류:', error);
    
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ 
      error: '서버 오류', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

/**
 * 실제 DB 또는 Mock DB에 저장
 */
router.post('/save', requireAuth, async (req: any, res) => {
  try {
    const { orders } = req.body;
    
    if (!orders || !Array.isArray(orders)) {
      return res.status(400).json({ error: '발주서 데이터가 누락되었습니다.' });
    }

    // 실제 DB 연결 확인
    if (db) {
      try {
        // 실제 DB에 저장 시도
        let savedOrders = 0;
        
        for (const orderData of orders) {
          // 1. 거래처 찾기 또는 생성
          let vendor = await db.select().from(vendors).where(eq(vendors.name, orderData.vendorName)).limit(1);
          let vendorId;
          
          if (vendor.length === 0) {
            const newVendor = await db.insert(vendors).values({
              name: orderData.vendorName,
              contactPerson: '자동생성',
              email: `auto-${Date.now()}@example.com`,
              mainContact: '자동생성'
            }).returning();
            vendorId = newVendor[0].id;
          } else {
            vendorId = vendor[0].id;
          }
          
          // 2. 프로젝트 찾기 또는 생성
          let project = await db.select().from(projects).where(eq(projects.projectName, orderData.siteName)).limit(1);
          let projectId;
          
          if (project.length === 0) {
            const newProject = await db.insert(projects).values({
              projectName: orderData.siteName,
              projectCode: `AUTO-${Date.now().toString().slice(-8)}`,
              status: 'active'
            }).returning();
            projectId = newProject[0].id;
          } else {
            projectId = project[0].id;
          }
          
          // 3. 발주서 생성
          const newOrder = await db.insert(purchaseOrders).values({
            orderNumber: orderData.orderNumber,
            projectId,
            vendorId,
            userId: req.user.id,
            orderDate: new Date(orderData.orderDate),
            deliveryDate: orderData.dueDate ? new Date(orderData.dueDate) : null,
            totalAmount: orderData.totalAmount,
            status: 'draft',
            notes: 'PO Template에서 자동 생성됨'
          }).returning();
          
          const orderId = newOrder[0].id;
          
          // 4. 발주서 아이템들 생성
          for (const item of orderData.items) {
            await db.insert(purchaseOrderItems).values({
              orderId,
              itemName: item.itemName,
              specification: item.specification,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              totalAmount: item.totalAmount,
              categoryLv1: item.categoryLv1,
              categoryLv2: item.categoryLv2,
              categoryLv3: item.categoryLv3,
              supplyAmount: item.supplyAmount,
              taxAmount: item.taxAmount,
              deliveryName: item.deliveryName,
              notes: item.notes
            });
          }
          
          savedOrders++;
        }
        
        res.json({
          success: true,
          message: '실제 DB 저장 완료',
          data: {
            savedOrders,
            usingMockDB: false
          }
        });
        
      } catch (dbError) {
        console.error('실제 DB 저장 실패, Mock DB로 폴백:', dbError);
        
        // Mock DB로 폴백
        const mockResult = await POTemplateProcessorMock.saveToDatabase(orders, req.user.id);
        
        if (!mockResult.success) {
          return res.status(500).json({ 
            error: 'Mock DB 저장도 실패', 
            details: mockResult.error 
          });
        }
        
        res.json({
          success: true,
          message: 'Mock DB 저장 완료 (실제 DB 연결 실패)',
          data: {
            savedOrders: mockResult.savedOrders,
            usingMockDB: true,
            dbError: dbError instanceof Error ? dbError.message : 'Unknown error'
          }
        });
      }
    } else {
      // DB 연결이 없는 경우 Mock DB 사용
      const mockResult = await POTemplateProcessorMock.saveToDatabase(orders, req.user.id);
      
      if (!mockResult.success) {
        return res.status(500).json({ 
          error: 'Mock DB 저장 실패', 
          details: mockResult.error 
        });
      }
      
      res.json({
        success: true,
        message: 'Mock DB 저장 완료 (DB 연결 없음)',
        data: {
          savedOrders: mockResult.savedOrders,
          usingMockDB: true
        }
      });
    }

  } catch (error) {
    console.error('PO Template 저장 오류:', error);
    res.status(500).json({ 
      error: '서버 오류', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

/**
 * 갑지/을지 시트 추출
 */
router.post('/extract-sheets', requireAuth, async (req: any, res) => {
  try {
    const { filePath, sheetNames = ['갑지', '을지'] } = req.body;
    
    if (!filePath) {
      return res.status(400).json({ error: '파일 경로가 필요합니다.' });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(400).json({ error: '파일을 찾을 수 없습니다.' });
    }

    const timestamp = Date.now();
    const extractedPath = path.join(
      path.dirname(filePath),
      `extracted-${timestamp}.xlsx`
    );

    const extractResult = POTemplateProcessorMock.extractSheetsToFile(
      filePath,
      extractedPath,
      sheetNames
    );

    if (!extractResult.success) {
      return res.status(500).json({ 
        error: '시트 추출 실패', 
        details: extractResult.error 
      });
    }

    res.json({
      success: true,
      message: '시트 추출 완료',
      data: {
        extractedPath,
        extractedSheets: extractResult.extractedSheets
      }
    });

  } catch (error) {
    console.error('시트 추출 오류:', error);
    res.status(500).json({ 
      error: '서버 오류', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

/**
 * DB 통계 조회 (실제 DB 우선, 실패시 Mock DB)
 */
router.get('/db-stats', requireAuth, async (req: any, res) => {
  try {
    if (db) {
      try {
        // 실제 DB에서 통계 조회
        const vendorCount = await db.select().from(vendors);
        const projectCount = await db.select().from(projects);
        const orderCount = await db.select().from(purchaseOrders);
        const itemCount = await db.select().from(purchaseOrderItems);
        
        res.json({
          success: true,
          data: {
            stats: {
              vendors: vendorCount.length,
              projects: projectCount.length,
              purchaseOrders: orderCount.length,
              purchaseOrderItems: itemCount.length
            },
            sampleData: {
              recentVendors: vendorCount.slice(-3),
              recentProjects: projectCount.slice(-3),
              recentOrders: orderCount.slice(-3),
              recentItems: itemCount.slice(-3)
            },
            usingMockDB: false
          }
        });
        
      } catch (dbError) {
        console.error('실제 DB 통계 조회 실패, Mock DB로 폴백:', dbError);
        
        // Mock DB로 폴백
        const stats = MockDB.getStats();
        const allData = MockDB.getAllData();
        
        res.json({
          success: true,
          data: {
            stats,
            sampleData: {
              recentVendors: allData.vendors.slice(-3),
              recentProjects: allData.projects.slice(-3),
              recentOrders: allData.purchaseOrders.slice(-3),
              recentItems: allData.purchaseOrderItems.slice(-3)
            },
            usingMockDB: true,
            dbError: dbError instanceof Error ? dbError.message : 'Unknown error'
          }
        });
      }
    } else {
      // DB 연결이 없는 경우 Mock DB 사용
      const stats = MockDB.getStats();
      const allData = MockDB.getAllData();
      
      res.json({
        success: true,
        data: {
          stats,
          sampleData: {
            recentVendors: allData.vendors.slice(-3),
            recentProjects: allData.projects.slice(-3),
            recentOrders: allData.purchaseOrders.slice(-3),
            recentItems: allData.purchaseOrderItems.slice(-3)
          },
          usingMockDB: true
        }
      });
    }
    
  } catch (error) {
    console.error('DB 통계 조회 오류:', error);
    res.status(500).json({ 
      error: '서버 오류', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

/**
 * 이메일 발송 (갑지/을지 시트 Excel + PDF 첨부)
 */
router.post('/send-email', requireAuth, async (req: any, res) => {
  try {
    const { 
      filePath, 
      to, 
      cc, 
      bcc, 
      subject, 
      orderNumber, 
      vendorName, 
      orderDate, 
      dueDate, 
      totalAmount, 
      additionalMessage 
    } = req.body;

    // 필수 필드 검증
    if (!filePath || !to || !subject) {
      return res.status(400).json({ 
        error: '필수 데이터가 누락되었습니다. (filePath, to, subject 필수)' 
      });
    }

    // 파일 존재 확인
    if (!fs.existsSync(filePath)) {
      return res.status(400).json({ error: '파일을 찾을 수 없습니다.' });
    }

    // 이메일 서비스 인스턴스 생성
    const emailService = new POEmailServiceMock();

    // 이메일 발송
    const emailResult = await emailService.sendPOWithAttachments(filePath, {
      to,
      cc,
      bcc,
      subject,
      orderNumber,
      vendorName,
      orderDate,
      dueDate,
      totalAmount,
      additionalMessage
    });

    if (!emailResult.success) {
      return res.status(500).json({ 
        error: '이메일 발송 실패', 
        details: emailResult.error 
      });
    }

    res.json({
      success: true,
      message: emailResult.mockMode ? '이메일 발송 완료 (Mock 모드)' : '이메일 발송 완료',
      data: {
        messageId: emailResult.messageId,
        recipients: Array.isArray(to) ? to : [to],
        attachments: ['갑지/을지 시트 (Excel)', '갑지/을지 시트 (PDF)'],
        mockMode: emailResult.mockMode
      }
    });

  } catch (error) {
    console.error('이메일 발송 오류:', error);
    res.status(500).json({ 
      error: '서버 오류', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

/**
 * PDF 변환 (갑지/을지 시트만)
 */
router.post('/convert-to-pdf', requireAuth, async (req: any, res) => {
  try {
    const { filePath, outputPath } = req.body;
    
    if (!filePath) {
      return res.status(400).json({ error: '파일 경로가 필요합니다.' });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(400).json({ error: '파일을 찾을 수 없습니다.' });
    }

    // PDF 변환
    const timestamp = Date.now();
    const pdfPath = outputPath || path.join(
      path.dirname(filePath),
      `po-sheets-${timestamp}.pdf`
    );

    const pdfResult = await convertExcelToPdfMock(filePath, pdfPath, ['갑지', '을지']);

    if (!pdfResult.success) {
      return res.status(500).json({ 
        error: 'PDF 변환 실패', 
        details: pdfResult.error 
      });
    }

    res.json({
      success: true,
      message: 'PDF 변환 완료',
      data: {
        pdfPath: pdfResult.pdfPath,
        originalFile: filePath,
        convertedSheets: ['갑지', '을지']
      }
    });

  } catch (error) {
    console.error('PDF 변환 오류:', error);
    res.status(500).json({ 
      error: '서버 오류', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

/**
 * 통합 처리 (업로드 → 파싱 → 검증 → 저장 → 추출 → 이메일)
 */
router.post('/process-complete', requireAuth, upload.single('file'), async (req: any, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '파일이 업로드되지 않았습니다.' });
    }

    const filePath = req.file.path;
    const { 
      sendEmail, 
      emailTo, 
      emailSubject, 
      emailMessage,
      generatePDF 
    } = req.body;

    const results = {
      upload: null,
      validation: null,
      parsing: null,
      saving: null,
      extraction: null,
      pdf: null,
      email: null
    };

    // 1. 업로드 및 유효성 검사
    console.log('📁 1단계: 파일 업로드 및 유효성 검사');
    const validation = await POTemplateValidator.validatePOTemplateFile(filePath);
    results.validation = validation;

    if (!validation.isValid) {
      fs.unlinkSync(filePath);
      return res.status(400).json({ 
        error: '유효성 검사 실패', 
        details: validation.errors.join(', '),
        results
      });
    }

    // 2. 파싱
    console.log('📊 2단계: 데이터 파싱');
    const parseResult = POTemplateProcessorMock.parseInputSheet(filePath);
    results.parsing = parseResult;

    if (!parseResult.success) {
      fs.unlinkSync(filePath);
      return res.status(400).json({ 
        error: '파싱 실패', 
        details: parseResult.error,
        results
      });
    }

    // 3. 데이터베이스 저장
    console.log('💾 3단계: 데이터베이스 저장');
    const saveResult = await this.saveToDatabase(parseResult.orders, req.user.id);
    results.saving = saveResult;

    // 4. 갑지/을지 시트 추출
    console.log('📋 4단계: 갑지/을지 시트 추출');
    const timestamp = Date.now();
    const extractedPath = path.join(
      path.dirname(filePath),
      `extracted-${timestamp}.xlsx`
    );

    const extractResult = POTemplateProcessorMock.extractSheetsToFile(
      filePath,
      extractedPath,
      ['갑지', '을지']
    );
    results.extraction = extractResult;

    // 5. PDF 변환 (옵션)
    if (generatePDF) {
      console.log('📄 5단계: PDF 변환');
      const pdfPath = path.join(
        path.dirname(filePath),
        `po-sheets-${timestamp}.pdf`
      );
      
      const pdfResult = await convertExcelToPdfMock(extractedPath, pdfPath);
      results.pdf = pdfResult;
    }

    // 6. 이메일 발송 (옵션)
    if (sendEmail && emailTo && emailSubject) {
      console.log('📧 6단계: 이메일 발송');
      const emailService = new POEmailServiceMock();
      
      const emailResult = await emailService.sendPOWithAttachments(extractedPath, {
        to: emailTo,
        subject: emailSubject,
        orderNumber: parseResult.orders[0]?.orderNumber,
        vendorName: parseResult.orders[0]?.vendorName,
        orderDate: parseResult.orders[0]?.orderDate,
        dueDate: parseResult.orders[0]?.dueDate,
        totalAmount: parseResult.orders[0]?.totalAmount,
        additionalMessage: emailMessage
      });
      
      results.email = emailResult;
    }

    console.log('✅ 모든 단계 완료');

    res.json({
      success: true,
      message: 'PO Template 통합 처리 완료',
      data: {
        fileName: req.file.originalname,
        results,
        summary: {
          totalOrders: parseResult.totalOrders,
          totalItems: parseResult.totalItems,
          validationPassed: validation.isValid,
          savedToDatabase: saveResult.success,
          sheetsExtracted: extractResult.success,
          pdfGenerated: results.pdf?.success || false,
          emailSent: results.email?.success || false
        }
      }
    });

  } catch (error) {
    console.error('통합 처리 오류:', error);
    
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ 
      error: '서버 오류', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

/**
 * 이메일 연결 테스트
 */
router.get('/test-email', requireAuth, async (req: any, res) => {
  try {
    const emailService = new POEmailServiceMock();
    const testResult = await emailService.testConnection();

    res.json({
      success: true,
      message: testResult.mockMode ? '이메일 Mock 모드 정상' : '이메일 서버 연결 성공',
      data: {
        mockMode: testResult.mockMode,
        error: testResult.error
      }
    });

  } catch (error) {
    console.error('이메일 연결 테스트 오류:', error);
    res.status(500).json({ 
      error: '서버 오류', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

/**
 * Mock DB 초기화
 */
router.post('/reset-db', requireAuth, (req: any, res) => {
  try {
    MockDB.clear();
    
    res.json({
      success: true,
      message: 'Mock DB 초기화 완료',
      data: MockDB.getStats()
    });
    
  } catch (error) {
    console.error('DB 초기화 오류:', error);
    res.status(500).json({ 
      error: '서버 오류', 
      details: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// 헬퍼 메서드 추가
router.saveToDatabase = async function(orders: any[], userId: string) {
  // 실제 DB 연결 확인
  if (db) {
    try {
      // 실제 DB에 저장 시도
      let savedOrders = 0;
      
      for (const orderData of orders) {
        // 1. 거래처 찾기 또는 생성
        let vendor = await db.select().from(vendors).where(eq(vendors.name, orderData.vendorName)).limit(1);
        let vendorId;
        
        if (vendor.length === 0) {
          const newVendor = await db.insert(vendors).values({
            name: orderData.vendorName,
            contactPerson: '자동생성',
            email: `auto-${Date.now()}@example.com`,
            mainContact: '자동생성'
          }).returning();
          vendorId = newVendor[0].id;
        } else {
          vendorId = vendor[0].id;
        }
        
        // 2. 프로젝트 찾기 또는 생성
        let project = await db.select().from(projects).where(eq(projects.projectName, orderData.siteName)).limit(1);
        let projectId;
        
        if (project.length === 0) {
          const newProject = await db.insert(projects).values({
            projectName: orderData.siteName,
            projectCode: `AUTO-${Date.now().toString().slice(-8)}`,
            status: 'active'
          }).returning();
          projectId = newProject[0].id;
        } else {
          projectId = project[0].id;
        }
        
        // 3. 발주서 생성
        const newOrder = await db.insert(purchaseOrders).values({
          orderNumber: orderData.orderNumber,
          projectId,
          vendorId,
          userId,
          orderDate: new Date(orderData.orderDate),
          deliveryDate: orderData.dueDate ? new Date(orderData.dueDate) : null,
          totalAmount: orderData.totalAmount,
          status: 'draft',
          notes: 'PO Template에서 자동 생성됨'
        }).returning();
        
        const orderId = newOrder[0].id;
        
        // 4. 발주서 아이템들 생성
        for (const item of orderData.items) {
          await db.insert(purchaseOrderItems).values({
            orderId,
            itemName: item.itemName,
            specification: item.specification,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalAmount: item.totalAmount,
            categoryLv1: item.categoryLv1,
            categoryLv2: item.categoryLv2,
            categoryLv3: item.categoryLv3,
            supplyAmount: item.supplyAmount,
            taxAmount: item.taxAmount,
            deliveryName: item.deliveryName,
            notes: item.notes
          });
        }
        
        savedOrders++;
      }
      
      return {
        success: true,
        savedOrders,
        usingMockDB: false
      };
      
    } catch (dbError) {
      console.error('실제 DB 저장 실패, Mock DB로 폴백:', dbError);
      
      // Mock DB로 폴백
      const mockResult = await POTemplateProcessorMock.saveToDatabase(orders, userId);
      
      return {
        success: mockResult.success,
        savedOrders: mockResult.savedOrders,
        usingMockDB: true,
        dbError: dbError instanceof Error ? dbError.message : 'Unknown error'
      };
    }
  } else {
    // DB 연결이 없는 경우 Mock DB 사용
    const mockResult = await POTemplateProcessorMock.saveToDatabase(orders, userId);
    
    return {
      success: mockResult.success,
      savedOrders: mockResult.savedOrders,
      usingMockDB: true
    };
  }
};

export default router;