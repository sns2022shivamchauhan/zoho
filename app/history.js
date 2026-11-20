/**
 * Module: Order History (history.js)
 * Complete log of all past & present orders, summary analytics, filtering, and receipt re-printing
 */

let historyFilterStatus = 'all';
let historyFilterType = 'all';

async function refreshHistory() {
  if (isZohoReady) {
    await loadLiveOrders();
  }
  renderOrderHistory();
}

function renderOrderHistory() {
  const tbody = document.getElementById('history-table-body');
  if (!tbody) return;

  // 1. Calculate KPI Metrics
  const totalCount = ordersData.length;
  const paidOrders = ordersData.filter(o => o.payment === 'Paid');
  const pendingOrders = ordersData.filter(o => o.payment !== 'Paid');
  const totalRevenue = paidOrders.reduce((sum, o) => sum + (typeof calculateOrderTotal === 'function' ? calculateOrderTotal(o) : (o.total || 0)), 0);

  const countEl = document.getElementById('hist-total-count');
  const salesEl = document.getElementById('hist-total-sales');
  const paidCountEl = document.getElementById('hist-paid-count');
  const pendingCountEl = document.getElementById('hist-pending-count');

  if (countEl) countEl.textContent = totalCount;
  if (salesEl) salesEl.textContent = '₹' + totalRevenue.toFixed(2);
  if (paidCountEl) paidCountEl.textContent = paidOrders.length;
  if (pendingCountEl) pendingCountEl.textContent = pendingOrders.length;

  // 2. Filter Orders
  const searchInput = document.getElementById('hist-search-input');
  const query = searchInput ? searchInput.value.toLowerCase().trim() : '';

  let filtered = [...ordersData];

  // Sort newest first
  filtered.sort((a, b) => {
    return String(b.id).localeCompare(String(a.id), undefined, { numeric: true });
  });

  if (historyFilterStatus === 'paid') {
    filtered = filtered.filter(o => o.payment === 'Paid');
  } else if (historyFilterStatus === 'unpaid') {
    filtered = filtered.filter(o => o.payment !== 'Paid');
  }

  if (historyFilterType !== 'all') {
    filtered = filtered.filter(o => (o.type || 'Dine-In').toLowerCase() === historyFilterType.toLowerCase());
  }

  if (query) {
    filtered = filtered.filter(o => {
      const orderNumMatch = String(o.orderNumber).toLowerCase().includes(query);
      const custMatch = String(o.customer || '').toLowerCase().includes(query);
      const tableMatch = String(o.table || '').toLowerCase().includes(query);
      const itemsMatch = (o.items || []).some(it => String(it.name).toLowerCase().includes(query));
      return orderNumMatch || custMatch || tableMatch || itemsMatch;
    });
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 36px; font-size: 13px;">🔍 No matching orders found in history.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(o => {
    const isPaid = o.payment === 'Paid';
    let statusClass = 'new';
    if (o.status === 'Cooking in Kitchen') statusClass = 'cooking';
    else if (o.status === 'Served' || o.status === 'Completed') statusClass = 'served';

    const grand = typeof calculateOrderTotal === 'function' ? calculateOrderTotal(o) : (o.total || 0);
    const isTakeaway = o.type === 'Takeaway' || o.table === 'Takeaway';
    const isDelivery = o.type === 'Delivery' || o.table === 'Delivery';

    const itemsSummary = (o.items && o.items.length > 0)
      ? o.items.map(it => `${it.name} <strong style="color: var(--text-main);">x${it.qty}</strong>`).join(', ')
      : 'Details in KOT';

    return `
      <tr>
        <td><strong>#${o.orderNumber}</strong></td>
        <td style="font-size: 12px; color: var(--text-muted);">${o.time || 'Just now'}</td>
        <td>
          ${isTakeaway ? `
            <span style="background: #ffedd5; color: #c2410c; border: 1px solid #fed7aa; padding: 2px 8px; border-radius: 6px; font-weight: 700; font-size: 11px;">
              📦 Takeaway
            </span>
          ` : (isDelivery ? `
            <span style="background: #ede9fe; color: #6d28d9; border: 1px solid #ddd6fe; padding: 2px 8px; border-radius: 6px; font-weight: 700; font-size: 11px;">
              🛵 Delivery
            </span>
          ` : `
            <span style="background: #eff6ff; color: #1e40af; border: 1px solid #bfdbfe; padding: 2px 8px; border-radius: 6px; font-weight: 700; font-size: 11px;">
              🍽️ Table ${o.table}
            </span>
          `)}
        </td>
        <td><strong>${o.customer || 'Guest'}</strong></td>
        <td style="max-width: 260px; font-size: 11px; color: var(--text-muted); line-height: 1.4;">${itemsSummary}</td>
        <td><strong style="color: #0f172a; font-size: 13px;">₹${grand.toFixed(2)}</strong></td>
        <td><span class="status-pill status-${statusClass}">${o.status}</span></td>
        <td><span class="status-pill status-${isPaid ? 'paid' : 'unpaid'}">${o.payment}</span></td>
        <td>
          <button class="table-action-btn" onclick="openReceipt('${o.id}')" title="Re-print Thermal Receipt">
            🖨️ Re-Print Bill
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function filterHistoryTable() {
  renderOrderHistory();
}

function setHistoryStatusFilter(status) {
  historyFilterStatus = status;
  ['all', 'paid', 'unpaid'].forEach(s => {
    const btn = document.getElementById('hist-filter-' + s);
    if (btn) btn.classList.remove('active');
  });
  const activeBtn = document.getElementById('hist-filter-' + status);
  if (activeBtn) activeBtn.classList.add('active');
  renderOrderHistory();
}

function setHistoryTypeFilter(type) {
  historyFilterType = type;
  renderOrderHistory();
}
