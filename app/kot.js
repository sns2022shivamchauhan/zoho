/**
 * Module: Kitchen Display (kot.js)
 * Live Kanban board for chef order progression with isolated KOT tickets and clean served clearing
 */

async function refreshKOT() {
  if (isZohoReady) {
    await loadLiveOrders();
  }
  loadKOTTickets();
  renderKOT();
}

function renderKOT() {
  const listNew = document.getElementById('kot-list-new');
  const listCooking = document.getElementById('kot-list-cooking');
  const listServed = document.getElementById('kot-list-served');

  if (!listNew || !listCooking || !listServed) return;

  // Filter KOT tickets by active stage
  const newTickets = kotTickets.filter(t => t.status === 'New Order');
  const cookingTickets = kotTickets.filter(t => t.status === 'Cooking in Kitchen');
  const servedTickets = kotTickets.filter(t => t.status === 'Served');

  document.getElementById('count-new').textContent = newTickets.length;
  document.getElementById('count-cooking').textContent = cookingTickets.length;
  document.getElementById('count-served').textContent = servedTickets.length;
  const badge = document.getElementById('kot-badge');
  if (badge) badge.textContent = newTickets.length;

  listNew.innerHTML = renderKOTCards(newTickets, 'new');
  listCooking.innerHTML = renderKOTCards(cookingTickets, 'cooking');
  listServed.innerHTML = renderKOTCards(servedTickets, 'served');
}

function renderKOTCards(tickets, stage) {
  if (tickets.length === 0) {
    return `<div style="text-align: center; padding: 30px; color: var(--text-muted); font-size: 12px;">No orders in this stage</div>`;
  }

  return tickets.map(t => `
    <div class="kot-card" id="card-${t.id}">
      <div class="kot-card-header">
        <span class="kot-card-table">
          📍 ${t.table}
          ${t.isAddon ? `<span style="background: #fef08a; color: #854d0e; border: 1px solid #facc15; font-size: 10px; font-weight: 800; padding: 2px 6px; border-radius: 4px; margin-left: 6px;">⚡ REPEAT / ADD-ON</span>` : ''}
        </span>
        <span class="kot-card-time">🕒 ${t.time}</span>
      </div>
      <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 6px;">
        #${t.orderNumber} | ${t.customer || 'Guest'}
      </div>
      <div class="kot-items-list">
        ${t.items && t.items.length > 0 ? t.items.map(it => `
          <div class="kot-item-entry">
            <span style="font-weight: 700;">${it.name}</span>
            <span style="font-weight: 800; font-size: 13px;">x${it.qty}</span>
          </div>
        `).join('') : `
          <div style="font-size: 11px; color: var(--text-muted); padding: 4px 0; font-style: italic;">
            (Item details sync in progress)
          </div>
        `}
      </div>
      <div class="kot-card-footer">
        ${stage === 'new' ? `
          <button class="kot-action-btn btn-start-cooking" onclick="updateTicketStatus('${t.id}', 'Cooking in Kitchen')">
            🔥 Start Cooking
          </button>
        ` : ''}
        ${stage === 'cooking' ? `
          <button class="kot-action-btn btn-mark-ready" onclick="updateTicketStatus('${t.id}', 'Served')">
            ✅ Mark Ready & Served
          </button>
        ` : ''}
        ${stage === 'served' ? `
          <div style="display: flex; flex-direction: column; gap: 6px; width: 100%; align-items: center;">
            <span style="font-size: 11px; color: var(--success); font-weight: 700;">
              ✨ Plated & Delivered to Table
            </span>
            <button class="kot-action-btn" style="background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; font-size: 11px; padding: 6px; width: 100%; cursor: pointer;" onclick="clearTicketFromKOT('${t.id}')">
              ✕ Remove from Kitchen Board
            </button>
          </div>
        ` : ''}
      </div>
    </div>
  `).join('');
}

async function updateTicketStatus(ticketId, newStatus) {
  const t = kotTickets.find(item => item.id === ticketId);
  if (!t) return;

  t.status = newStatus;
  saveKOTTickets();

  // If marked Served, also update Master Order status in Zoho & local memory
  if (t.orderId) {
    const masterOrder = ordersData.find(o => String(o.id) === String(t.orderId));
    if (masterOrder && newStatus === 'Served') {
      masterOrder.status = 'Served';
      if (isZohoReady && ZOHO.CREATOR) {
        try {
          await ZOHO.CREATOR.API.updateRecord({
            reportName: 'All_Orders',
            id: t.orderId,
            data: {
              data: {
                Order_Status: 'Served'
              }
            }
          });
        } catch (e) {
          console.warn('Zoho ticket status update error:', e);
        }
      }
    }
  }

  renderKOT();
  if (currentActiveView === 'bills') renderActiveOrders();
}

function clearTicketFromKOT(ticketId) {
  kotTickets = kotTickets.filter(item => item.id !== ticketId);
  saveKOTTickets();
  renderKOT();
}

function clearAllServedTickets() {
  kotTickets = kotTickets.filter(item => item.status !== 'Served');
  saveKOTTickets();
  renderKOT();
}
