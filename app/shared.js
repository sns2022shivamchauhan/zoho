/**
 * Module: Shared Engine (shared.js)
 * Master View Switcher, Zoho Creator SDK Init, Data Store, and KOT Tickets Manager
 */

// Custom In-App Alert Modal (Replaces browser's ugly "An embedded page at ... says" popup)
function showCustomAlert(message, customTitle) {
  let title = customTitle;
  let icon = '🍽️';

  if (!title) {
    if (message.includes('Paid') || message.includes('Payment')) {
      title = 'Payment Received';
      icon = '💵';
    } else if (message.includes('placed successfully') || message.includes('sent to Kitchen') || message.includes('placed')) {
      title = 'Order Confirmed';
      icon = '✅';
    } else if (message.includes('Repeat') || message.includes('Add-on')) {
      title = 'Kitchen Ticket Sent';
      icon = '⚡';
    } else if (message.includes('Please select') || message.includes('Please add') || message.includes('Notice')) {
      title = 'Notice';
      icon = '⚠️';
    } else {
      title = 'Khana Khajana POS';
      icon = '🍽️';
    }
  }

  let modal = document.getElementById('custom-alert-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'custom-alert-modal';
    modal.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.65);
      backdrop-filter: blur(3px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999999;
      font-family: inherit;
    `;
    document.body.appendChild(modal);

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        if (modal.style.display === 'flex') modal.style.display = 'none';
      }
    });
  }

  modal.innerHTML = `
    <div style="
      background: #ffffff;
      border-radius: 16px;
      width: 90%;
      max-width: 420px;
      padding: 26px 24px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
      text-align: center;
      animation: popUpAlert 0.22s cubic-bezier(0.16, 1, 0.3, 1);
    ">
      <div style="font-size: 42px; margin-bottom: 12px; line-height: 1;">${icon}</div>
      <h3 style="margin: 0 0 10px 0; font-size: 18px; font-weight: 800; color: #0f172a; letter-spacing: -0.3px;">${title}</h3>
      <div style="font-size: 14px; color: #475569; line-height: 1.5; margin-bottom: 22px; word-break: break-word;">
        ${message.replace(/\n/g, '<br>')}
      </div>
      <button id="custom-alert-btn-ok" style="
        background: #059669;
        color: #ffffff;
        border: none;
        padding: 12px 24px;
        border-radius: 10px;
        font-size: 15px;
        font-weight: 700;
        cursor: pointer;
        width: 100%;
        box-shadow: 0 4px 10px -1px rgba(5, 150, 105, 0.3);
        transition: all 0.2s ease;
      " onmouseover="this.style.background='#047857'" onmouseout="this.style.background='#059669'" onclick="document.getElementById('custom-alert-modal').style.display = 'none'">
        OK
      </button>
    </div>
  `;

  modal.style.display = 'flex';
  setTimeout(() => {
    const btn = document.getElementById('custom-alert-btn-ok');
    if (btn) btn.focus();
  }, 50);
}

// Override window.alert globally
window.alert = function(msg) {
  showCustomAlert(String(msg || ''));
};
window.showCustomAlert = showCustomAlert;

let isZohoReady = false;
let currentActiveView = 'pos';
let tablesData = [];
let menuData = [];
let categoriesData = ['All'];
let ordersData = [];
let kotTickets = []; // Individual KOT tickets for the kitchen board
let taxSettings = { cgst: 2.5, sgst: 2.5 };

// Instant Tab Switcher
function switchView(viewName) {
  currentActiveView = viewName;

  ['pos', 'kot', 'bills', 'history'].forEach(v => {
    const tabBtn = document.getElementById(`tab-${v}`);
    const viewContainer = document.getElementById(`view-${v}`);
    if (tabBtn) tabBtn.classList.remove('active');
    if (viewContainer) viewContainer.style.display = 'none';
  });

  const activeBtn = document.getElementById(`tab-${viewName}`);
  const activeView = document.getElementById(`view-${viewName}`);
  if (activeBtn) activeBtn.classList.add('active');
  if (activeView) activeView.style.display = 'flex';

  if (viewName === 'pos') {
    syncTableOccupancy();
    renderTables();
    renderCategories();
    renderMenu();
  } else if (viewName === 'kot') {
    renderKOT();
  } else if (viewName === 'bills') {
    renderActiveOrders();
  } else if (viewName === 'history') {
    if (typeof renderOrderHistory === 'function') renderOrderHistory();
  }
}

// Clock
function startClock() {
  const clockEl = document.getElementById('live-clock');
  if (!clockEl) return;
  setInterval(() => {
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString('en-IN', { hour12: true });
  }, 1000);
}

// Formatters
function formatTableVal(tbl, defaultType) {
  if (!tbl) return defaultType || 'Dine-In';
  if (typeof tbl === 'object') {
    return tbl.display_value || tbl.Table_Number || tbl.Table_Name || 'Table';
  }
  return tbl;
}

function formatItemNameVal(it) {
  if (!it) return 'Dish';
  if (it.name) return it.name;
  if (it.Food_Menu) {
    if (typeof it.Food_Menu === 'object') {
      return it.Food_Menu.display_value || it.Food_Menu.Dish_Name || it.Food_Menu.Item_Name || 'Dish';
    }
    const found = menuData.find(m => m.id == it.Food_Menu);
    if (found) return found.name;
    return it.Food_Menu;
  }
  return it.Dish_Name || it.Item_Name || 'Dish';
}

// Sequential Order Number System (Starts from 1: #ORD-1, #ORD-2, #ORD-3...)
let orderSeqMap = {};

function initOrderSeqMap() {
  try {
    const raw = localStorage.getItem('pos_order_seq_map');
    if (raw) orderSeqMap = JSON.parse(raw);
  } catch(e) {
    orderSeqMap = {};
  }
}
initOrderSeqMap();

function saveOrderSeqMap() {
  try {
    localStorage.setItem('pos_order_seq_map', JSON.stringify(orderSeqMap));
  } catch(e) {}
}

function getNextOrderSeq() {
  const values = Object.values(orderSeqMap);
  if (values.length === 0) return 1;
  const max = Math.max(...values.map(v => parseInt(v) || 0));
  return max + 1;
}

function getOrderSeqNumber(id, orderNum) {
  // If Zoho Creator already provides an auto-number like "1", "ORD-1", etc.
  if (orderNum && String(orderNum).trim() && !String(orderNum).includes('427573600000')) {
    const clean = String(orderNum).trim();
    return clean.startsWith('ORD-') ? clean : `ORD-${clean}`;
  }

  const idStr = String(id || '');
  if (!idStr) return 'ORD-1';

  if (!orderSeqMap[idStr]) {
    orderSeqMap[idStr] = getNextOrderSeq();
    saveOrderSeqMap();
  }

  return `ORD-${orderSeqMap[idStr]}`;
}

function formatOrderNumber(orderNum, id) {
  return getOrderSeqNumber(id, orderNum);
}

// Zoho Report Fetch Helper
async function fetchZohoReport(candidateReportNames) {
  if (!isZohoReady || !ZOHO.CREATOR) return null;
  for (const repName of candidateReportNames) {
    try {
      const resp = await ZOHO.CREATOR.API.getAllRecords({ reportName: repName });
      if (resp && resp.data && Array.isArray(resp.data) && resp.data.length > 0) {
        return resp.data;
      }
    } catch (e) {
      // Continue next
    }
  }
  return null;
}

// KOT Tickets Persistence (Local storage cache so tickets survive tab switches & reloads)
function loadKOTTickets() {
  try {
    const raw = localStorage.getItem('pos_kot_tickets');
    if (raw) {
      kotTickets = JSON.parse(raw);
    }
  } catch(e) {
    kotTickets = [];
  }

  // If kotTickets is empty (e.g. initial setup), seed with existing active orders
  if (!kotTickets || kotTickets.length === 0) {
    kotTickets = [];
    ordersData.forEach(o => {
      if (o.payment !== 'Paid' && o.status !== 'Completed' && o.status !== 'Served') {
        kotTickets.push({
          id: 'kot_' + o.id + '_init',
          orderId: o.id,
          orderNumber: o.orderNumber,
          table: o.table,
          customer: o.customer,
          time: o.time,
          isAddon: false,
          items: (o.items && o.items.length > 0) ? [...o.items] : [],
          status: o.status || 'New Order'
        });
      }
    });
    saveKOTTickets();
  }
}

function saveKOTTickets() {
  try {
    localStorage.setItem('pos_kot_tickets', JSON.stringify(kotTickets));
  } catch(e) {}
}

// Master Zoho Creator Initialization
document.addEventListener('DOMContentLoaded', () => {
  startClock();

  if (typeof ZOHO !== 'undefined' && ZOHO.CREATOR) {
    const syncEl = document.getElementById('sync-status');
    if (syncEl) syncEl.textContent = 'Connecting to Zoho...';

    ZOHO.CREATOR.init()
      .then(async function() {
        isZohoReady = true;
        if (syncEl) syncEl.textContent = 'Zoho Live Connected';
        console.log('Zoho Creator SDK successfully initialized!');

        await loadAllZohoData();

        const cgstEl = document.getElementById('cgst-rate');
        const sgstEl = document.getElementById('sgst-rate');
        if (cgstEl) cgstEl.textContent = taxSettings.cgst;
        if (sgstEl) sgstEl.textContent = taxSettings.sgst;

        renderTables();
        renderCategories();
        renderMenu();
        renderKOT();
        renderActiveOrders();
        if (typeof renderOrderHistory === 'function') renderOrderHistory();
      })
      .catch(function(err) {
        console.warn('Zoho SDK init failed:', err);
        if (syncEl) syncEl.textContent = 'Connection Error';
      });
  } else {
    const syncEl = document.getElementById('sync-status');
    if (syncEl) syncEl.textContent = 'Standalone Mode';
    loadKOTTickets();
  }
});

// Load Data from Zoho
async function loadAllZohoData() {
  try {
    // 1. Food Menu
    const dishes = await fetchZohoReport(['All_Food_Menus', 'Food_Menu', 'Food_Menu_Report', 'All_Food_Menu', 'Food_Menus']);
    if (dishes && dishes.length > 0) {
      menuData = dishes.map(m => {
        let cat = 'Main Course';
        if (m.Category) {
          cat = typeof m.Category === 'object' ? (m.Category.Category_Name || m.Category.display_value || 'Main Course') : m.Category;
        }
        return {
          id: m.ID,
          name: m.Dish_Name || 'Dish',
          price: parseFloat(m.Price || 0),
          category: cat,
          isVeg: true
        };
      });

      const cats = new Set(['All']);
      menuData.forEach(m => cats.add(m.category));
      categoriesData = Array.from(cats);
    }

    // 2. Tables
    const tables = await fetchZohoReport(['All_Dining_Tables', 'Dining_Tables', 'Dining_Tables_Report', 'All_Tables']);
    if (tables && tables.length > 0) {
      tablesData = tables.map(t => ({
        id: t.ID,
        name: (t.Table_Number || t.display_value || t.Table_Name || `Table ${t.ID}`).toString().trim(),
        status: (t.Status && t.Status.toString().toLowerCase() === 'occupied') ? 'occupied' : 'available',
        capacity: t.Seating_Capacity || 4
      }));
    }

    // 3. Settings (Taxes)
    const settings = await fetchZohoReport(['All_Restaurant_Settings', 'Restaurant_Settings']);
    if (settings && settings.length > 0) {
      const s = settings[0];
      if (s.CGST) taxSettings.cgst = parseFloat(s.CGST);
      if (s.SGST) taxSettings.sgst = parseFloat(s.SGST);
    }

    // 4. Live Orders
    await loadLiveOrders();

    // 5. Load and sync KOT tickets
    loadKOTTickets();

    // 6. Synchronize table status
    syncTableOccupancy();
  } catch (err) {
    console.warn('Error loading live Zoho data:', err);
  }
}

async function loadLiveOrders() {
  const liveOrders = await fetchZohoReport(['All_Orders', 'Orders', 'Orders_Report']);
  if (liveOrders && liveOrders.length > 0) {
    // Sort chronologically so earliest order is #1, then #2, #3, #4...
    const sorted = [...liveOrders].sort((a, b) => {
      return String(a.ID).localeCompare(String(b.ID), undefined, { numeric: true });
    });

    sorted.forEach((o, idx) => {
      const idStr = String(o.ID);
      if (!orderSeqMap[idStr]) {
        orderSeqMap[idStr] = idx + 1;
      }
    });
    saveOrderSeqMap();

    ordersData = liveOrders.map(o => {
      const rawSubform = o.order_items || o.Order_Items || o['Order_Items'] || o.order_item || o.Order_Item;
      let itemsList = [];

      if (Array.isArray(rawSubform) && rawSubform.length > 0) {
        itemsList = rawSubform.map(it => ({
          name: formatItemNameVal(it),
          qty: it.Quantity || it.Qty || 1,
          price: it.Price || it.Rate || 0
        }));
      }

      if (itemsList.length === 0) {
        try {
          const cached = localStorage.getItem('pos_order_items_' + o.ID) || 
                         localStorage.getItem('pos_order_items_' + (o.Order_Number || ''));
          if (cached) {
            itemsList = JSON.parse(cached);
          }
        } catch(e) {}
      }

      return {
        id: o.ID,
        orderNumber: formatOrderNumber(o.Order_Number, o.ID),
        time: o.Order_Time || 'Just now',
        table: formatTableVal(o.Dining_Tables, o.Order_Type).toString().trim(),
        type: o.Order_Type || 'Dine-In',
        customer: o.Customer_Name || 'Guest',
        items: itemsList,
        total: parseFloat(o.Grand_Total || 0),
        status: o.Order_Status || 'New Order',
        payment: o.Payment_Status || 'Unpaid'
      };
    });

    syncTableOccupancy();
  }
}

// Synchronize Table Occupancy with Active (Unpaid) Orders
function syncTableOccupancy() {
  if (!tablesData || tablesData.length === 0) return;

  const activeOccupiedTables = new Set();
  ordersData.forEach(o => {
    if (o.payment !== 'Paid' && o.status !== 'Completed') {
      const tblName = (o.table || '').toString().trim();
      if (tblName && tblName !== 'Takeaway' && tblName !== 'Delivery' && tblName !== 'None') {
        activeOccupiedTables.add(tblName);
      }
    }
  });

  tablesData.forEach(t => {
    const isOccupied = activeOccupiedTables.has(t.name);
    t.status = isOccupied ? 'occupied' : 'available';
  });

  renderTables();
}
