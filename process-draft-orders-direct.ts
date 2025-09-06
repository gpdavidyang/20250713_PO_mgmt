import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { purchaseOrders, attachments, purchaseOrderItems, vendors, projects, companies, users } from './shared/schema';
import { eq, and, isNull, desc, sql } from 'drizzle-orm';
import { PDFGenerationService, type PurchaseOrderPDFData } from './server/services/pdf-generation-service';

const DATABASE_URL = "postgresql://postgres.tbvugytmskxxyqfvqmup:gps110601ysw@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres";

const client = postgres(DATABASE_URL);
const db = drizzle(client);

interface OrderWithDetails {
  id: number;
  orderNumber: string;
  orderDate: Date;
  deliveryDate?: Date | null;
  status: string;
  orderStatus?: string | null;
  totalAmount: number;
  notes?: string | null;
  paymentTerms?: string | null;
  deliveryTerms?: string | null;
  userId: string;
  items: any[];
  vendor?: any;
  project?: any;
  company?: any;
  user?: any;
}

async function findDraftOrdersWithoutPDF() {
  console.log('🔍 임시저장 상태에서 PDF가 없는 발주서 조회 중...');

  // 임시저장 상태의 발주서를 가져오고, PDF 첨부파일이 있는지 확인
  const ordersWithPDFCount = await db
    .select({
      id: purchaseOrders.id,
      orderNumber: purchaseOrders.orderNumber,
      status: purchaseOrders.status,
      orderStatus: purchaseOrders.orderStatus,
      createdAt: purchaseOrders.createdAt,
      pdfCount: sql<number>`COUNT(${attachments.id})`
    })
    .from(purchaseOrders)
    .leftJoin(attachments, and(
      eq(purchaseOrders.id, attachments.orderId),
      eq(attachments.mimeType, 'application/pdf')
    ))
    .where(
      sql`(${purchaseOrders.status} = 'draft' OR ${purchaseOrders.orderStatus} = 'draft')`
    )
    .groupBy(purchaseOrders.id, purchaseOrders.orderNumber, purchaseOrders.status, purchaseOrders.orderStatus, purchaseOrders.createdAt)
    .having(sql`COUNT(${attachments.id}) = 0`)
    .orderBy(desc(purchaseOrders.createdAt))
    .limit(10);

  console.log(`✅ PDF가 없는 임시저장 발주서 ${ordersWithPDFCount.length}개 발견`);
  
  return ordersWithPDFCount.map(order => order.id);
}

async function getOrderDetails(orderId: number): Promise<OrderWithDetails | null> {
  console.log(`📋 발주서 ID ${orderId} 상세정보 조회 중...`);

  // 발주서 기본 정보
  const [order] = await db
    .select()
    .from(purchaseOrders)
    .where(eq(purchaseOrders.id, orderId));

  if (!order) {
    console.log(`❌ 발주서 ID ${orderId}를 찾을 수 없습니다`);
    return null;
  }

  // 품목 정보
  const items = await db
    .select()
    .from(purchaseOrderItems)
    .where(eq(purchaseOrderItems.orderId, orderId));

  // 거래처 정보
  let vendor = null;
  if (order.vendorId) {
    [vendor] = await db
      .select()
      .from(vendors)
      .where(eq(vendors.id, order.vendorId));
  }

  // 프로젝트 정보
  let project = null;
  if (order.projectId) {
    [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, order.projectId));
  }

  // 회사 정보
  let company = null;
  if (order.companyId) {
    [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, order.companyId));
  }

  // 사용자 정보
  let user = null;
  if (order.userId) {
    [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, order.userId));
  }

  return {
    ...order,
    items,
    vendor,
    project,
    company,
    user
  };
}

function transformToPDFData(orderDetails: OrderWithDetails): PurchaseOrderPDFData {
  return {
    orderNumber: orderDetails.orderNumber,
    orderDate: new Date(orderDetails.orderDate),
    deliveryDate: orderDetails.deliveryDate ? new Date(orderDetails.deliveryDate) : undefined,
    projectName: orderDetails.project?.projectName,
    vendorName: orderDetails.vendor?.name,
    vendorContact: orderDetails.vendor?.contactPerson,
    vendorEmail: orderDetails.vendor?.email,
    items: orderDetails.items.map(item => ({
      category: item.majorCategory,
      subCategory1: item.middleCategory,
      subCategory2: item.minorCategory,
      name: item.itemName,
      specification: item.specification || '',
      quantity: parseFloat(item.quantity) || 0,
      unit: item.unit || '개',
      unitPrice: parseFloat(item.unitPrice) || 0,
      price: parseFloat(item.totalAmount) || 0
    })),
    totalAmount: parseFloat(orderDetails.totalAmount) || 0,
    notes: orderDetails.notes || '',
    companyName: orderDetails.company?.companyName,
    companyAddress: orderDetails.company?.address,
    companyPhone: orderDetails.company?.phone,
  };
}

async function generatePDFForOrder(orderDetails: OrderWithDetails) {
  console.log(`📄 발주서 ${orderDetails.orderNumber} PDF 생성 시작...`);

  try {
    // 발주서 데이터를 PDF 형식으로 변환
    const pdfData = transformToPDFData(orderDetails);
    
    // PDFGenerationService를 직접 사용하여 PDF 생성
    const result = await PDFGenerationService.regeneratePDF(
      orderDetails.id,
      pdfData,
      orderDetails.userId
    );

    if (result.success) {
      console.log(`✅ PDF 생성 완료: ${orderDetails.orderNumber} (첨부파일 ID: ${result.attachmentId})`);
      return result.attachmentId;
    } else {
      console.log(`❌ PDF 생성 실패: ${orderDetails.orderNumber} - ${result.error}`);
      return null;
    }
  } catch (error) {
    console.log(`❌ PDF 생성 중 오류: ${orderDetails.orderNumber}`, error);
    return null;
  }
}

async function updateOrderStatus(orderId: number, orderNumber: string) {
  console.log(`🔄 발주서 ${orderNumber} 상태를 '발주생성'으로 업데이트 중...`);

  try {
    await db
      .update(purchaseOrders)
      .set({ 
        status: 'approved',    // purchase_order_status enum
        orderStatus: 'created', // order_status enum
        updatedAt: new Date()
      })
      .where(eq(purchaseOrders.id, orderId));

    console.log(`✅ 상태 업데이트 완료: ${orderNumber}`);
    return true;
  } catch (error) {
    console.log(`❌ 상태 업데이트 실패: ${orderNumber}`, error);
    return false;
  }
}

async function processDraftOrders() {
  try {
    console.log('🚀 임시저장 발주서 PDF 생성 및 상태 업데이트 시작');
    
    // 1. PDF가 없는 임시저장 발주서 10개 조회
    const orderIds = await findDraftOrdersWithoutPDF();
    
    if (orderIds.length === 0) {
      console.log('✅ PDF가 없는 임시저장 발주서가 없습니다.');
      return;
    }

    console.log(`📋 처리할 발주서 ${orderIds.length}개 발견: ${orderIds.join(', ')}`);

    let successCount = 0;
    let failCount = 0;

    // 2. 각 발주서에 대해 PDF 생성 및 상태 업데이트
    for (const orderId of orderIds) {
      console.log(`\n--- 발주서 ID ${orderId} 처리 시작 ---`);
      
      try {
        // 발주서 상세 정보 조회
        const orderDetails = await getOrderDetails(orderId);
        if (!orderDetails) {
          console.log(`❌ 발주서 ID ${orderId} 상세 정보를 가져올 수 없습니다`);
          failCount++;
          continue;
        }

        // PDF 생성 (직접 서비스 호출)
        const attachmentId = await generatePDFForOrder(orderDetails);
        if (!attachmentId) {
          console.log(`❌ 발주서 ${orderDetails.orderNumber} PDF 생성 실패`);
          failCount++;
          continue;
        }

        // 상태 업데이트
        const statusUpdated = await updateOrderStatus(orderId, orderDetails.orderNumber);
        if (!statusUpdated) {
          console.log(`❌ 발주서 ${orderDetails.orderNumber} 상태 업데이트 실패`);
          failCount++;
          continue;
        }

        successCount++;
        console.log(`✅ 발주서 ${orderDetails.orderNumber} 처리 완료 (PDF ID: ${attachmentId})`);
        
        // 잠시 대기 (서버 부하 방지)
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.log(`❌ 발주서 ID ${orderId} 처리 중 오류:`, error);
        failCount++;
      }
    }

    console.log(`\n🎉 작업 완료!`);
    console.log(`✅ 성공: ${successCount}개`);
    console.log(`❌ 실패: ${failCount}개`);

  } catch (error) {
    console.error('❌ 전체 작업 중 오류 발생:', error);
  } finally {
    await client.end();
    process.exit(0);
  }
}

// 스크립트 실행
processDraftOrders();