const nodemailer = require('nodemailer');

// 이메일 전송 설정
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER || 'test@example.com',
    pass: process.env.EMAIL_PASSWORD || 'test'
  },
  tls: {
    rejectUnauthorized: false
  }
});

// HTML 이메일 내용 생성
const generateEmailContent = (options) => {
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('ko-KR', {
      style: 'currency',
      currency: 'KRW'
    }).format(amount);
  };

  const formatDate = (dateString) => {
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
            background-color: #3b82f6;
            color: white;
            padding: 20px;
            text-align: center;
            border-radius: 8px 8px 0 0;
          }
          
          .content {
            background-color: white;
            padding: 30px;
            border: 1px solid #ddd;
            border-top: none;
            border-radius: 0 0 8px 8px;
          }
          
          .info-table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
          }
          
          .info-table td, .info-table th {
            padding: 12px;
            text-align: left;
            border: 1px solid #ddd;
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
          
          .highlight {
            background-color: #fff3cd;
            padding: 15px;
            border-radius: 5px;
            margin: 20px 0;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>📋 발주서 송부 (테스트)</h1>
          <p>IKJIN 구매 발주 관리 시스템</p>
        </div>
        
        <div class="content">
          <p>안녕하세요,</p>
          <p>테스트 발주서를 송부드립니다. 이메일 발송 기능이 정상적으로 작동하는지 확인하는 테스트입니다.</p>
          
          ${options.orderNumber ? `
            <table class="info-table">
              <tr>
                <th>발주번호</th>
                <td><strong>${options.orderNumber}</strong></td>
              </tr>
              ${options.vendorName ? `
                <tr>
                  <th>거래처명</th>
                  <td>${options.vendorName}</td>
                </tr>
              ` : ''}
              <tr>
                <th>발주일자</th>
                <td>${formatDate(options.orderDate || new Date().toISOString())}</td>
              </tr>
              ${options.totalAmount ? `
                <tr>
                  <th>총 금액</th>
                  <td><strong style="color: #e11d48;">${formatCurrency(options.totalAmount)}</strong></td>
                </tr>
              ` : ''}
              ${options.siteName ? `
                <tr>
                  <th>현장명</th>
                  <td>${options.siteName}</td>
                </tr>
              ` : ''}
            </table>
          ` : ''}
          
          <div class="highlight">
            <h3>📝 테스트 정보</h3>
            <p>이것은 이메일 발송 기능을 테스트하기 위한 메일입니다.</p>
            <p><strong>발송 시간:</strong> ${new Date().toLocaleString('ko-KR')}</p>
            <p><strong>시스템:</strong> IKJIN 구매 발주 관리 시스템</p>
          </div>
          
          ${options.additionalMessage ? `
            <div class="highlight">
              <h3>📝 추가 안내사항</h3>
              <p>${options.additionalMessage.replace(/\\n/g, '<br>')}</p>
            </div>
          ` : ''}
          
          <p>
            이메일 발송 기능이 정상적으로 작동하는 것을 확인했습니다.<br>
            문의사항이 있으시면 언제든지 연락주시기 바랍니다.
          </p>
          
          <p>감사합니다.</p>
        </div>
        
        <div class="footer">
          <p>
            이 메일은 IKJIN 구매 발주 관리 시스템에서 테스트 목적으로 발송되었습니다.<br>
            발송 시간: ${new Date().toLocaleString('ko-KR')}
          </p>
        </div>
      </body>
    </html>
  `;
};

// 이메일 발송 함수
async function sendTestEmail() {
  const orderData = {
    orderNumber: 'PO-TEST-20250106-' + Date.now(),
    vendorName: 'IKJIN 테스트 거래처',
    orderDate: '2025-01-06',
    totalAmount: 1500000,
    siteName: 'IKJIN 프로젝트 현장'
  };

  const emailHtml = generateEmailContent({
    ...orderData,
    additionalMessage: '안녕하세요,\\n\\n테스트 발주서를 송부드립니다.\\n이메일 발송 기능이 정상적으로 작동하는지 확인하는 테스트입니다.\\n\\n발주 정보가 위 표에 정리되어 있습니다.\\n\\n감사합니다.'
  });

  const mailOptions = {
    from: process.env.EMAIL_USER || 'noreply@ikjin.com',
    to: 'davidswyang@gmail.com',
    subject: `【IKJIN 테스트】 발주서 - ${orderData.orderNumber}`,
    html: emailHtml
  };

  // 개발 환경에서는 실제 이메일 발송 대신 로그만 출력
  if (process.env.NODE_ENV === 'development' || !process.env.EMAIL_USER) {
    console.log('🧪 [테스트 모드] 이메일 발송 시뮬레이션:');
    console.log('📧 수신자:', mailOptions.to);
    console.log('📄 제목:', mailOptions.subject);
    console.log('📋 내용 길이:', mailOptions.html.length, '문자');
    console.log('✅ 이메일 발송이 성공적으로 시뮬레이션되었습니다.');
    console.log('📝 실제 발송을 위해서는 EMAIL_USER, EMAIL_PASSWORD 환경변수를 설정하세요.');
    
    return {
      success: true,
      messageId: 'test-' + Date.now(),
      mockMode: true,
      message: '테스트 모드: 이메일이 실제로 발송되지 않았습니다.'
    };
  } else {
    // 실제 이메일 발송
    try {
      const info = await transporter.sendMail(mailOptions);
      console.log('✅ 이메일 발송 성공:', info.messageId);
      console.log('📧 수신자:', mailOptions.to);
      console.log('📄 제목:', mailOptions.subject);
      
      return {
        success: true,
        messageId: info.messageId,
        mockMode: false
      };
    } catch (error) {
      console.error('❌ 이메일 발송 실패:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// 메인 실행
sendTestEmail()
  .then(result => {
    console.log('🎯 최종 결과:', result);
    process.exit(0);
  })
  .catch(error => {
    console.error('💥 오류 발생:', error);
    process.exit(1);
  });