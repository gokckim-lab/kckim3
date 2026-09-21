import { LegalLayout, LegalSection, OPERATOR } from '../components/LegalLayout';

export default function Privacy() {
  return (
    <LegalLayout title="개인정보처리방침">
      <p>{OPERATOR.company}(이하 "회사")는 {OPERATOR.service} 서비스(이하 "서비스") 이용자의 개인정보를 소중히 다루며, 「개인정보 보호법」 등 관련 법령을 준수합니다. 이 방침을 통해 어떤 정보를 어떤 목적으로 처리하는지 안내합니다.</p>

      <LegalSection title="1. 수집하는 개인정보 항목">
        <ul className="list-disc list-inside space-y-1">
          <li><b>회원가입·로그인</b>: 이메일, 비밀번호(암호화되어 저장). 구글 로그인 시 구글 계정의 이메일</li>
          <li><b>회사정보(회원이 입력)</b>: 상호, 사업자등록번호, 대표자명, 사업장 주소, 업태, 종목, 담당자명, 전화번호, 이메일, 입금계좌 정보</li>
          <li><b>거래 데이터(회원이 입력)</b>: 거래처 정보, 품목, 견적서·주문서·거래명세서·세금계산서 내용</li>
          <li><b>포인트·결제</b>: 충전·차감·환불 내역, 입금자명, 환불 계좌정보(환불 신청 시), 카드결제 승인 결과와 금액(카드번호는 저장하지 않으며 결제대행사가 처리)</li>
          <li><b>문의</b>: 문의 내용, 회원 이메일</li>
          <li><b>자동 수집</b>: 접속 IP, 브라우저·기기 정보, 접속 일시(서비스 호스팅 과정에서 생성되는 로그)</li>
        </ul>
        <p>체험 모드(가입 없이 사용)에서 작성한 문서와 공급자 정보는 이용자의 브라우저에만 저장되며 회사 서버로 전송·수집되지 않습니다.</p>
      </LegalSection>

      <LegalSection title="2. 개인정보의 처리 목적">
        <ul className="list-disc list-inside space-y-1">
          <li>회원 식별, 가입·탈퇴 처리, 부정 이용 방지</li>
          <li>문서 작성·변환·저장 등 서비스 제공</li>
          <li>전자세금계산서 발행 및 거래처에 대한 이메일 발송</li>
          <li>포인트 충전·결제·환불 처리, 충전 결제에 대한 증빙(세금계산서 등) 발급</li>
          <li>문의 응대 및 공지 전달, 서비스 개선</li>
        </ul>
      </LegalSection>

      <LegalSection title="3. 보유 및 이용 기간">
        <p>원칙적으로 회원 탈퇴 시 지체 없이 파기합니다. 다만 관련 법령에 따라 아래 기간 동안 보관합니다.</p>
        <ul className="list-disc list-inside space-y-1">
          <li>계약 또는 청약철회, 대금결제 및 재화·용역 공급에 관한 기록: 5년 (전자상거래 등에서의 소비자보호에 관한 법률)</li>
          <li>거래 증빙 및 장부 관련 자료: 5년 (국세기본법, 부가가치세법 등)</li>
          <li>소비자 불만 또는 분쟁 처리에 관한 기록: 3년 (전자상거래 등에서의 소비자보호에 관한 법률)</li>
          <li>접속 로그: 3개월 (통신비밀보호법)</li>
        </ul>
        <p>탈퇴 시 충전·결제 등 거래기록은 위 법정 기간 동안 다른 데이터와 분리하여 보관하며, 법령에서 정한 목적 외로 이용하지 않습니다. 그 밖의 문서·거래처·품목 등 작성 데이터는 탈퇴 즉시 삭제됩니다.</p>
      </LegalSection>

      <LegalSection title="4. 개인정보의 제3자 제공">
        <p>회사는 원칙적으로 이용자의 개인정보를 제3자에게 제공하지 않습니다. 다만 이용자가 전자세금계산서를 발행하는 경우, 부가가치세법에 따라 발행 내용(공급자·공급받는자 정보, 거래 내역)이 제휴사(팝빌)를 통해 국세청에 전송되며, 공급받는자에게 이메일이 발송됩니다. 법령에 따라 수사기관 등이 적법한 절차로 요청하는 경우에도 제공될 수 있습니다.</p>
      </LegalSection>

      <LegalSection title="5. 개인정보 처리업무의 위탁 및 국외 이전">
        <p>회사는 안정적인 서비스 제공을 위해 다음과 같이 처리업무를 위탁하고 있습니다. 일부 수탁사는 해외에 서버를 두고 있어 개인정보가 국외에서 처리·보관될 수 있습니다.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border border-slate-200">
            <thead className="bg-slate-50">
              <tr><th className="p-2 text-left border-b">수탁사</th><th className="p-2 text-left border-b">위탁 업무</th></tr>
            </thead>
            <tbody>
              <tr><td className="p-2 border-b">Supabase</td><td className="p-2 border-b">회원 인증, 데이터베이스 저장</td></tr>
              <tr><td className="p-2 border-b">Vercel</td><td className="p-2 border-b">웹 서비스 호스팅</td></tr>
              <tr><td className="p-2 border-b">Railway</td><td className="p-2 border-b">서버(API) 운영</td></tr>
              <tr><td className="p-2 border-b">팝빌(링크허브)</td><td className="p-2 border-b">전자세금계산서 발행·국세청 전송·이메일 발송</td></tr>
              <tr><td className="p-2 border-b">NICE페이먼츠</td><td className="p-2 border-b">카드결제·가상계좌 결제 처리</td></tr>
              <tr><td className="p-2 border-b">Resend</td><td className="p-2 border-b">문의 내용 이메일 전달</td></tr>
              <tr><td className="p-2">Google</td><td className="p-2">구글 계정 로그인(선택)</td></tr>
            </tbody>
          </table>
        </div>
        <p>이용자가 입력한 거래처(공급받는자) 정보는 이용자가 세금계산서 발행 등을 위해 직접 입력하는 정보이며, 회사는 이용자의 위탁을 받아 해당 목적 범위에서만 처리합니다.</p>
      </LegalSection>

      <LegalSection title="6. 이용자의 권리와 행사 방법">
        <p>이용자는 언제든지 자신의 개인정보를 조회·수정할 수 있고(회사정보 메뉴), 회원탈퇴로 삭제를 요구하거나 처리 정지를 요청할 수 있습니다. 서비스 내 "문의하기" 또는 {OPERATOR.email}로 요청하시면 지체 없이 조치합니다. 단, 법령에 따라 보관해야 하는 정보는 삭제 요청에도 해당 기간 동안 보관됩니다.</p>
      </LegalSection>

      <LegalSection title="7. 개인정보의 파기">
        <p>보유 기간이 끝났거나 처리 목적이 달성된 개인정보는 지체 없이 파기합니다. 전자적 파일은 복구할 수 없는 방법으로 삭제합니다. 법령에 따라 보관해야 하는 정보는 별도로 분리하여 보관한 뒤 기간이 끝나면 파기합니다.</p>
      </LegalSection>

      <LegalSection title="8. 안전성 확보 조치">
        <ul className="list-disc list-inside space-y-1">
          <li>비밀번호는 암호화하여 저장하며 회사도 원문을 알 수 없습니다.</li>
          <li>전송 구간은 HTTPS로 암호화하고, 데이터베이스는 회원별 접근 통제를 적용합니다.</li>
          <li>결제·인증 등 비밀키는 서버에서만 보관하며 접근 권한을 최소화합니다.</li>
        </ul>
      </LegalSection>

      <LegalSection title="9. 브라우저 저장소 사용">
        <p>서비스는 로그인 유지와 체험 모드 문서 저장을 위해 브라우저 저장소(localStorage)를 사용합니다. 광고·추적 목적의 쿠키는 사용하지 않습니다. 브라우저 설정에서 저장 데이터를 삭제할 수 있으며, 삭제 시 로그아웃되거나 체험 모드 문서가 사라질 수 있습니다.</p>
      </LegalSection>

      <LegalSection title="10. 개인정보 보호책임자">
        <p>성명: {OPERATOR.ceo} (대표)<br />이메일: {OPERATOR.email}<br />
          개인정보 침해에 관한 상담이 필요하시면 개인정보침해신고센터(privacy.kisa.or.kr, 국번없이 118), 개인정보분쟁조정위원회(kopico.go.kr, 1833-6972) 등에 문의하실 수 있습니다.</p>
      </LegalSection>

      <LegalSection title="11. 방침의 변경">
        <p>이 방침이 변경되는 경우 시행 7일 전부터 서비스 내에 공지하며, 이용자에게 불리한 중요한 변경은 30일 전에 공지합니다.</p>
      </LegalSection>
    </LegalLayout>
  );
}
