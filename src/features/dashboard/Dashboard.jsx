import { defaultViewScope, usesTeamOverview } from "../../shared/lib/review-scope.js";
import { isReceivedPurchase } from "../purchases/purchase-values.js";
import { expiryWarnings } from "../reports/report-data.js";
import { formatDate, money, num } from "../../app/formatters.js";
import DashboardMetrics, { InventoryMetrics, MovementMetrics } from "./DashboardMetrics.jsx";
import { inventoryMetrics } from "./dashboard-metrics.js";
import { styles } from "../../app/styles.js";
import RecentRecords from "../../shared/components/RecentRecords.jsx";
import { PurchaseSummaryCard, WorkRequestCard } from "../../shared/components/request-records.jsx";
import { Empty } from "../../shared/components/ui.jsx";
import { AttachmentPanel } from "../../shared/components/attachments.jsx";
import { formatPublicNumber } from "../../shared/lib/public-number.js";

function Dashboard({ onReimbursementChange, stockOutRequests = [], accounts = [], stockRows = [], currentUser, workRequests, batches, purchases, attachments = [], onDownloadAttachment, canManageStock = false, setActiveTab }) {
  const financeOverview = defaultViewScope(currentUser) === "all";
  const teamOverview = usesTeamOverview(currentUser);
  const emptyRequestText = type => financeOverview ? `团队近期暂无${type}申请。` : currentUser?.account_type === "admin" ? `团队近期暂无需审批的${type}申请。` : canManageStock ? `你近期暂无需审批的${type}申请。` : `你近期暂无${type}申请。`;
  const expiringBatches = expiryWarnings(batches);
  const lowBatches = batches.filter((b) => num(b.current_qty) <= num(b.min_qty || 0));

  const pendingInbound = purchases.filter(p => !isReceivedPurchase(p) && ["待入库", "已通过"].includes(p.status));
  const recentWorkRows = type => workRequests.filter(row => row.request_type === type);
  const pendingStockApprovals = stockOutRequests.filter(row => row.status === '待采购人审批' && (teamOverview || row.purchaser_username === currentUser.username)).length;
  const pendingStockCompletion = stockOutRequests.filter(row => row.status === '已同意待出库' && (teamOverview || row.applicant_username === currentUser.username)).length;

  return <main>
    <p className="platform-metric-scope">当前统计：<strong>{currentUser?.account_type === "student" ? "本人申请" : teamOverview ? "团队全部申请" : "指定本人审核的申请"}</strong> · 随页面搜索更新</p>
    <DashboardMetrics workRequests={workRequests} purchases={purchases} mode={financeOverview ? "report" : currentUser?.account_type === "student" ? "student" : currentUser?.account_type === "teacher" ? "review" : "team"} money={money} onOpen={setActiveTab} />
    <InventoryMetrics inventory={inventoryMetrics(batches)} label="团队库存" onOpen={() => setActiveTab("materials")} />
    <MovementMetrics label={currentUser?.account_type === "student" ? "本人库存流水" : "团队库存流水"} rows={stockRows} onOpen={() => setActiveTab("stock")} />
    {(pendingStockApprovals > 0 || pendingStockCompletion > 0) && <section style={styles.card}><div style={styles.cardHeader}><h2 style={styles.h2}>私用/项目用物品出库待办</h2><button style={styles.secondaryButton} onClick={() => setActiveTab('stock')}>查看出库申请</button></div><p style={styles.meta}>{teamOverview ? '团队待采购人审批' : '待你审批'}：<strong>{pendingStockApprovals}</strong> 条 · {teamOverview ? '团队待完成出库' : '你待完成出库'}：<strong>{pendingStockCompletion}</strong> 条</p></section>}
    {pendingInbound.length > 0 && <section style={styles.card}>
      <div style={styles.cardHeader}>
        <div><h2 style={styles.h2}>待入库提醒</h2><p style={styles.muted}>采购审核通过后，由原申请人到货时上传实物照片并完成入库，入库完成后采购才定义为“已完成”。</p></div>
        <button style={styles.primaryButton} onClick={() => setActiveTab("purchases")}>{financeOverview ? "查看采购记录" : currentUser?.account_type === "teacher" ? "查看采购审核" : currentUser?.account_type === "admin" ? "查看采购记录" : "去入库"}</button>
      </div>
      <RecentRecords rows={pendingInbound}>{shown => shown.map((row) => <PurchaseSummaryCard currentUser={currentUser} onReimbursementChange={onReimbursementChange} key={row._id} row={row} />)}</RecentRecords>
    </section>}
    <div style={styles.twoColumns}>
      <div style={styles.sideStack}>
        {[{ type: "测试", tab: "test" }, { type: "加工", tab: "processing" }, { type: "维修", tab: "repair" }].map(({ type, tab }) => {
          const recentRows = recentWorkRows(type);
          return <section key={type} style={styles.card}>
            <div style={styles.cardHeader}><h2 style={styles.h2}>近期{type}</h2><button style={styles.lightButton} onClick={() => setActiveTab(tab)}>进入{type}{financeOverview ? "记录" : currentUser?.account_type === "teacher" ? "审核" : currentUser?.account_type === "admin" ? "记录" : ""}</button></div>
            {recentRows.length === 0 ? <Empty text={emptyRequestText(type)} /> : <RecentRecords rows={recentRows}>{shown => shown.map((row) => <WorkRequestCard currentUser={currentUser} onReimbursementChange={onReimbursementChange} key={row._id} row={row} compact attachmentPanel={<AttachmentPanel attachments={attachments.filter((a) => !a.deleted_at && a.target_collection === "lab_work_requests" && (String(a.target_id) === String(row._id) || (a.target_public_id && a.target_public_id === row.public_id)))} onDownload={onDownloadAttachment} />} />)}</RecentRecords>}
          </section>;
        })}
        <section style={styles.card}>
          <div style={styles.cardHeader}><h2 style={styles.h2}>近期采购</h2><button style={styles.lightButton} onClick={() => setActiveTab("purchases")}>进入采购{financeOverview ? "记录" : currentUser?.account_type === "teacher" ? "审核" : currentUser?.account_type === "admin" ? "记录" : ""}</button></div>
          {purchases.length === 0 ? <Empty text={emptyRequestText("采购")} /> : <RecentRecords rows={purchases}>{shown => shown.map((row) => <PurchaseSummaryCard currentUser={currentUser} onReimbursementChange={onReimbursementChange} key={row._id} row={row} />)}</RecentRecords>}
        </section>
      </div>
      <aside style={styles.sideStack}>
        <section style={styles.card}><div style={styles.cardHeader}><h2 style={styles.h2}>近期库存流水</h2><button style={styles.lightButton} onClick={() => setActiveTab("stock")}>进入{canManageStock ? "出入退库" : "出/退库"}</button></div>
          {stockRows.length === 0 ? <Empty text="近期暂无库存流水。" /> : <RecentRecords rows={stockRows}>{shown => shown.map(row => <div key={row._id} style={styles.listItem}><h3 style={styles.h3}>{row.transaction_type} · {row.material_name}</h3><p style={styles.meta}>操作人：<strong className="platform-identity">{row.operator_name || row.operator_username}</strong> · {formatDate(row.created_at)}</p><p style={styles.meta}>{row.quantity} {row.unit} · {formatPublicNumber(row.batch_code)} · {row.storage_location || "未登记位置"}</p></div>)}</RecentRecords>}
        </section>
        {currentUser?.account_type === "admin" && <section style={styles.card}><div style={styles.cardHeader}><h2 style={styles.h2}>账号情况</h2><button style={styles.lightButton} onClick={() => setActiveTab("admin")}>进入账号管理</button></div><dl className="platform-account-summary">{[['全部账号', accounts.length], ['启用', accounts.filter(row => row.status === 'active').length], ['待审核', accounts.filter(row => row.status === 'pending').length], ['停用', accounts.filter(row => row.status === 'disabled').length]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>}

        <section style={styles.card}>
          <div style={styles.cardHeader}><h2 style={styles.h2}>有效期预警</h2><button style={styles.lightButton} onClick={() => setActiveTab("materials")}>查看库存</button></div>
          <p style={styles.muted}>提醒仍有库存、已过期或未来 30 天内到期的材料。</p>
          {expiringBatches.length === 0 ? <p style={styles.muted}>暂无临期或过期材料。</p> : <RecentRecords rows={expiringBatches}>{shown => <div>{shown.map(batch => <div key={batch._id} style={{ ...styles.warningBox, ...(batch.daysRemaining < 0 ? { background: "#fef2f2", color: "#991b1b", borderColor: "#fecaca" } : {}) }}><b>{batch.material_name} · {batch.daysRemaining < 0 ? `已过期 ${-batch.daysRemaining} 天` : batch.daysRemaining === 0 ? "今日到期" : `${batch.daysRemaining} 天后到期`}</b><div>{formatPublicNumber(batch.batch_code)} · 有效期 {batch.expiry_date} · 剩余 {batch.current_qty} {batch.unit} · 位置 {batch.storage_location || "-"}</div></div>)}</div>}</RecentRecords>}
        </section>
        <section style={styles.card}>
          <div style={styles.cardHeader}><h2 style={styles.h2}>库存预警</h2>{canManageStock && <button style={styles.lightButton} onClick={() => setActiveTab("materials")}>查看库存</button>}</div>
          {lowBatches.length === 0 ? <p style={styles.muted}>暂无低库存批次。</p> : <RecentRecords rows={lowBatches}>{shown => shown.map((b) => <div key={b._id} style={styles.warningBox}>{b.material_name}：{b.current_qty} {b.unit}，位置 {b.storage_location || "-"}</div>)}</RecentRecords>}
        </section>
      </aside>
    </div>
  </main>;
}
export { Dashboard };
