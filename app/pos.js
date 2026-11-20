/**
 * Module: Touch POS Logic (pos.js)
 * Tables, Dishes, Live Cart, Verified Order Submission, and Separate KOT Add-ons
 */

let currentOrderType = 'Dine-In';
let selectedTable = null;
let currentCategory = 'All';
let cart = []; // Holds items for a new order, or pending repeat/add-on items for an occupied table
let currentViewingOrder = null;

// Tables
function renderTables() {
  const container = document.getElementById('tables-container');
  if (!container) return;
  container.innerHTML = '';

  if (tablesData.length === 0) {
    container.innerHTML = '<div style="padding: 8px 12px; color: var(--text-muted); font-size: 12px;">No tables found in Dining Tables.</div>';
    return;
  }

  tablesData.forEach(t => {
    const isSelected = selectedTable && selectedTable.id === t.id;
    const pill = document.createElement('div');
    pill.className = `table-pill ${t.status} ${isSelected ? 'selected' : ''}`;
    pill.onclick = () => selectDiningTable(t);
    pill.innerHTML = `
      <span class="table-name">${t.name}</span>
      <span class="table-status">${t.status}</span>
    `;
    container.appendChild(pill);
  });
}

function selectDiningTable(table) {
  selectedTable = table;
  const label = document.getElementById('selected-table-label');
  if (label) label.textContent = table.name;

  // Check if this table has an active running order!
  const activeOrder = ordersData.find(o => 
    o.table.toString().trim() === table.name.toString().trim() && 
    o.payment !== 'Paid' && 
    o.status !== 'Completed'
  );

  currentViewingOrder = activeOrder || null;
  cart = []; // Reset any pending unsent items when switching tables

  if (activeOrder) {
    renderRunningTableOrder();
  } else {
    resetToNewOrderMode();
  }

  renderTables();
}

function resetToNewOrderMode() {
  currentViewingOrder = null;
  const titleEl = document.querySelector('.cart-title');
  if (titleEl) titleEl.textContent = 'New Order Cart';

  const nameInput = document.getElementById('cust-name');
  const phoneInput = document.getElementById('cust-phone');
  if (nameInput) { nameInput.value = ''; nameInput.disabled = false; }
  if (phoneInput) { phoneInput.value = ''; phoneInput.disabled = false; }

  restorePunchOrderButton();
  renderCart();
}

function restorePunchOrderButton() {
  const cartActions = document.querySelector('.cart-actions');
  if (cartActions) {
    cartActions.innerHTML = `
      <button class="btn btn-primary" id="btn-submit-order" onclick="submitOrder()">
        <span class="btn-icon">⚡</span> Punch Order & Send to KOT
      </button>
    `;
  }
}

// Render active running order for an occupied table (with Add-ons support)
function renderRunningTableOrder() {
  if (!currentViewingOrder) return;
  const activeOrder = currentViewingOrder;
  
  // Set title
  const titleEl = document.querySelector('.cart-title');
  if (titleEl) {
    titleEl.innerHTML = `Table ${activeOrder.table} <span style="font-size: 11px; font-weight: 700; color: #dc2626; background: #fee2e2; padding: 2px 8px; border-radius: 12px; margin-left: 6px;">● OCCUPIED</span>`;
  }

  // Pre-fill customer details as read-only
  const nameInput = document.getElementById('cust-name');
  const phoneInput = document.getElementById('cust-phone');
  if (nameInput) {
    nameInput.value = `${activeOrder.customer} (Order #${activeOrder.orderNumber})`;
    nameInput.disabled = true;
  }
  if (phoneInput) {
    phoneInput.value = `Time: ${activeOrder.time}`;
    phoneInput.disabled = true;
  }

  // Render items in cart container
  const container = document.getElementById('cart-items-list') || document.getElementById('cart-items-container');
  if (!container) return;
  container.innerHTML = '';

  // 1. Running Order status banner
  const banner = document.createElement('div');
  banner.style.cssText = 'background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 10px 12px; margin-bottom: 12px; font-size: 12px; display: flex; justify-content: space-between; align-items: center;';
  banner.innerHTML = `
    <div>
      <strong style="color: #1e40af; font-size: 13px;">Active Order #${activeOrder.orderNumber}</strong><br>
      <span style="color: #64748b; font-size: 11px;">Kitchen Stage: <strong>${activeOrder.status}</strong></span>
    </div>
    <span class="status-pill status-${activeOrder.status === 'New Order' ? 'new' : (activeOrder.status === 'Cooking in Kitchen' ? 'cooking' : 'served')}">${activeOrder.status}</span>
  `;
  container.appendChild(banner);

  // 2. Section: Already Ordered Dishes (in Kitchen / Served)
  const orderedHeader = document.createElement('div');
  orderedHeader.style.cssText = 'font-size: 11px; font-weight: 700; color: #64748b; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;';
  orderedHeader.textContent = 'Already Ordered (In Kitchen / Served):';
  container.appendChild(orderedHeader);

  if (activeOrder.items && activeOrder.items.length > 0) {
    activeOrder.items.forEach(item => {
      const row = document.createElement('div');
      row.className = 'cart-item-row';
      row.style.cssText = 'background: #f8fafc; padding: 8px 12px; border-radius: 6px; margin-bottom: 6px; border: 1px solid var(--border-color);';
      row.innerHTML = `
        <div class="cart-item-info">
          <div class="cart-item-name" style="font-weight: 700; color: var(--text-main);">${item.name}</div>
          <div class="cart-item-rate" style="font-size: 11px; color: var(--text-muted);">
            ₹${parseFloat(item.price).toFixed(2)} / unit • <span style="color: #059669; font-weight: 600;">✓ In Kitchen</span>
          </div>
        </div>
        <div class="cart-item-controls">
          <span class="qty-val" style="background: #e2e8f0; padding: 2px 8px; border-radius: 4px; font-weight: 800; font-size: 12px;">x${item.qty}</span>
        </div>
        <div class="cart-item-total" style="font-weight: 800; color: var(--text-main);">₹${(item.price * item.qty).toFixed(2)}</div>
      `;
      container.appendChild(row);
    });
  } else {
    container.innerHTML += '<div style="padding: 10px; color: var(--text-muted); font-size: 12px;">No items details recorded</div>';
  }

  // 3. Section: New Add-on / Repeat Items (Pending Send to Kitchen)
  if (cart.length > 0) {
    const addonHeader = document.createElement('div');
    addonHeader.style.cssText = 'font-size: 11px; font-weight: 700; color: #b45309; background: #fef3c7; padding: 6px 10px; border-radius: 6px; margin: 12px 0 6px 0; text-transform: uppercase; letter-spacing: 0.5px; display: flex; justify-content: space-between; align-items: center; border: 1px solid #fde68a;';
    addonHeader.innerHTML = `
      <span>⚡ New Repeat / Add-on (Ready to Send):</span>
      <button style="background: none; border: none; color: #dc2626; font-size: 11px; cursor: pointer; text-decoration: underline; font-weight: 700;" onclick="clearPendingAddons()">Cancel</button>
    `;
    container.appendChild(addonHeader);

    cart.forEach(item => {
      const row = document.createElement('div');
      row.className = 'cart-item-row';
      row.style.cssText = 'background: #fffbeb; padding: 8px 12px; border-radius: 6px; margin-bottom: 6px; border: 1px solid #fde68a;';
      row.innerHTML = `
        <div class="cart-item-info">
          <div class="cart-item-name" style="font-weight: 700; color: #92400e;">${item.name}</div>
          <div class="cart-item-rate" style="font-size: 11px; color: #b45309;">₹${item.price.toFixed(2)} / unit • New Request</div>
        </div>
        <div class="cart-item-controls">
          <button class="qty-btn" onclick="updateCartQty('${item.id}', -1)">-</button>
          <span class="qty-val" style="background: #ffffff; padding: 2px 6px; border-radius: 4px; font-weight: 800; border: 1px solid #fcd34d;">${item.qty}</span>
          <button class="qty-btn" onclick="updateCartQty('${item.id}', 1)">+</button>
        </div>
        <div class="cart-item-total" style="font-weight: 800; color: #92400e;">₹${(item.price * item.qty).toFixed(2)}</div>
      `;
      container.appendChild(row);
    });
  } else {
    const tip = document.createElement('div');
    tip.style.cssText = 'font-size: 11px; color: var(--text-muted); text-align: center; padding: 8px 0; border-top: 1px dashed var(--border-color); margin-top: 8px;';
    tip.innerHTML = '👉 <em>Click any dish from menu to repeat or add more items to Table ' + activeOrder.table + '</em>';
    container.appendChild(tip);
  }

  // Calculate combined totals (already ordered + new add-ons)
  const existingSubtotal = activeOrder.items.reduce((acc, it) => acc + (it.price * it.qty), 0);
  const newSubtotal = cart.reduce((acc, it) => acc + (it.price * it.qty), 0);
  const totalSubtotal = existingSubtotal + newSubtotal;

  const cgst = (totalSubtotal * taxSettings.cgst) / 100;
  const sgst = (totalSubtotal * taxSettings.sgst) / 100;
  const grandTotal = totalSubtotal + cgst + sgst;

  const subTotalEl = document.getElementById('sub-total-val') || document.getElementById('summary-subtotal');
  const cgstValEl = document.getElementById('cgst-val');
  const sgstValEl = document.getElementById('sgst-val');
  const grandEl = document.getElementById('grand-total-val') || document.getElementById('summary-grand');
  
  if (subTotalEl) subTotalEl.textContent = '₹' + totalSubtotal.toFixed(2);
  if (cgstValEl) cgstValEl.textContent = '₹' + cgst.toFixed(2);
  if (sgstValEl) sgstValEl.textContent = '₹' + sgst.toFixed(2);
  if (grandEl) grandEl.textContent = '₹' + grandTotal.toFixed(2);

  // Actions Bar
  const cartActions = document.querySelector('.cart-actions');
  if (cartActions) {
    if (cart.length > 0) {
      // User added new dishes to this table: show "Send Add-on to Kitchen (KOT)" button
      cartActions.innerHTML = `
        <div style="display: flex; gap: 8px; flex-direction: column;">
          <button class="btn" id="btn-send-addon" style="background: #2563eb; color: #ffffff; font-weight: 700; height: 44px; border-radius: 8px; font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; box-shadow: var(--shadow-sm);" onclick="submitAddonToKOT()">
            ⚡ Send Add-on to Kitchen (New Orders)
          </button>
          <button class="btn" style="background: #059669; color: #ffffff; font-weight: 600; height: 38px; border-radius: 8px; font-size: 13px; cursor: pointer;" onclick="payBillFromTable('${activeOrder.id}')">
            💵 Pay Full Bill & Free Table
          </button>
        </div>
      `;
    } else {
      // Normal running order without pending add-ons: show Pay Bill and Print Bill
      cartActions.innerHTML = `
        <div style="display: flex; gap: 8px; flex-direction: column;">
          <button class="btn" style="background: #059669; color: #ffffff; font-weight: 700; height: 44px; border-radius: 8px; font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; box-shadow: var(--shadow-sm);" onclick="payBillFromTable('${activeOrder.id}')">
            💵 Pay Bill & Free Table
          </button>
          <button class="btn" style="background: #ffffff; color: var(--text-main); border: 1px solid var(--border-color); font-weight: 600; height: 38px; border-radius: 8px; font-size: 13px; cursor: pointer;" onclick="openReceipt('${activeOrder.id}')">
            🖨️ Print Running Bill
          </button>
        </div>
      `;
    }
  }
}

function clearPendingAddons() {
  cart = [];
  renderRunningTableOrder();
}

// Submit newly added / repeated items to Kitchen for an already occupied table
async function submitAddonToKOT() {
  if (!currentViewingOrder || cart.length === 0) return;

  const btn = document.getElementById('btn-send-addon');
  if (btn) {
    btn.textContent = 'Sending to Kitchen...';
    btn.disabled = true;
  }

  // 1. Snapshot ONLY the newly added items for the Kitchen KOT ticket
  const addonItemsSnapshot = cart.map(i => ({
    name: i.name,
    qty: parseInt(i.qty) || 1,
    price: parseFloat(i.price) || 0
  }));

  // 2. Merge items into Master Bill so total bill tracks everything
  cart.forEach(newItem => {
    const existing = currentViewingOrder.items.find(i => i.name === newItem.name);
    if (existing) {
      existing.qty += newItem.qty;
    } else {
      currentViewingOrder.items.push({
        name: newItem.name,
        qty: newItem.qty,
        price: newItem.price
      });
    }
  });

  // 3. Cache updated complete items for Master Bill printing
  try {
    localStorage.setItem('pos_order_items_' + currentViewingOrder.id, JSON.stringify(currentViewingOrder.items));
  } catch(e) {}

  const nowTime = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

  // SMART KOT DISPATCH:
  // Check if this table ALREADY has an order waiting in "New Orders" (Chef has NOT started cooking yet)
  const pendingNewTicket = kotTickets.find(t => 
    (String(t.orderId) === String(currentViewingOrder.id) || t.table.toString().trim() === currentViewingOrder.table.toString().trim()) && 
    t.status === 'New Order'
  );

  const count = cart.length;

  if (pendingNewTicket) {
    // SCENARIO 1: Order is still in "New Orders" (Chef has NOT started cooking yet)
    // Simply UPDATE the existing ticket in New Orders! (No duplicate card)
    addonItemsSnapshot.forEach(newItem => {
      const existingInTicket = pendingNewTicket.items.find(i => i.name === newItem.name);
      if (existingInTicket) {
        existingInTicket.qty += newItem.qty;
      } else {
        pendingNewTicket.items.push({
          name: newItem.name,
          qty: newItem.qty,
          price: newItem.price
        });
      }
    });
    pendingNewTicket.time = nowTime;
    saveKOTTickets();
    alert(`✅ Order for Table ${currentViewingOrder.table} updated in Kitchen (New Orders)!`);
  } else {
    // SCENARIO 2: Order is ALREADY in "Cooking in Kitchen" or has been "Served"
    // Chef is already cooking or has served! Create a dedicated REPEAT / ADD-ON card in "New Orders"!
    const newTicket = {
      id: 'kot_' + currentViewingOrder.id + '_' + Date.now(),
      orderId: currentViewingOrder.id,
      orderNumber: currentViewingOrder.orderNumber,
      table: currentViewingOrder.table,
      customer: currentViewingOrder.customer,
      time: nowTime,
      isAddon: true, // Display ⚡ REPEAT / ADD-ON badge
      items: addonItemsSnapshot, // ONLY the newly added items!
      status: 'New Order' // Lands in New Orders so Chef sees the new preparation request!
    };
    kotTickets.push(newTicket);
    saveKOTTickets();
    alert(`✅ Repeat / Add-on sent to Kitchen as a new preparation ticket!`);
  }

  // 5. Update Master Bill Total
  const subtotal = currentViewingOrder.items.reduce((acc, it) => acc + (it.price * it.qty), 0);
  const tax = (subtotal * (taxSettings.cgst + taxSettings.sgst)) / 100;
  currentViewingOrder.total = subtotal + tax;

  // Clear new add-ons queue
  cart = [];

  // Update views
  renderRunningTableOrder();
  renderKOT();
  renderActiveOrders();
}

async function payBillFromTable(orderId) {
  if (typeof payAndCompleteOrder === 'function') {
    await payAndCompleteOrder(orderId);
  }
  clearCart();
}

function setOrderType(type) {
  currentOrderType = type;

  const types = ['dinein', 'takeaway', 'delivery'];
  types.forEach(t => {
    const btn = document.getElementById('type-' + t);
    if (btn) btn.classList.remove('active');
  });

  const activeKey = type.toLowerCase().replace('-', '');
  const activeBtn = document.getElementById('type-' + activeKey);
  if (activeBtn) activeBtn.classList.add('active');

  const typeLabel = document.getElementById('selected-type-label');
  if (typeLabel) typeLabel.textContent = type;

  if (type !== 'Dine-In') {
    selectedTable = null;
    const tableLabel = document.getElementById('selected-table-label');
    if (tableLabel) tableLabel.textContent = type;
    resetToNewOrderMode();
  } else {
    const tableLabel = document.getElementById('selected-table-label');
    if (tableLabel) tableLabel.textContent = selectedTable ? selectedTable.name : 'None';
  }

  renderTables();
}

// Categories & Food Menu
function renderCategories() {
  const container = document.getElementById('category-pills');
  if (!container) return;
  container.innerHTML = '';

  categoriesData.forEach(cat => {
    const pill = document.createElement('div');
    pill.className = `cat-pill ${cat === currentCategory ? 'active' : ''}`;
    pill.textContent = cat;
    pill.onclick = () => {
      currentCategory = cat;
      renderCategories();
      renderMenu();
    };
    container.appendChild(pill);
  });
}

function renderMenu() {
  const grid = document.getElementById('menu-grid');
  if (!grid) return;
  grid.innerHTML = '';

  const searchInput = document.getElementById('search-input');
  const query = searchInput ? searchInput.value.toLowerCase().trim() : '';

  let filtered = menuData;
  if (currentCategory !== 'All') {
    filtered = filtered.filter(d => d.category === currentCategory);
  }
  if (query) {
    filtered = filtered.filter(d => d.name.toLowerCase().includes(query));
  }

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted); font-size: 14px;">
        🔍 No food dishes found matching your selection
      </div>
    `;
    return;
  }

  filtered.forEach(dish => {
    const card = document.createElement('div');
    card.className = 'dish-card food-card';
    card.onclick = () => addToCart(dish.id);
    card.innerHTML = `
      <div class="dish-top food-info">
        <span class="dish-name food-name">${dish.name}</span>
        <span class="dish-badge food-type-tag ${dish.isVeg ? 'veg' : 'non-veg'}">
          ${dish.isVeg ? '● Veg' : '▲ Non-Veg'}
        </span>
      </div>
      <div class="dish-bottom food-footer">
        <span class="dish-price food-price">&#8377;${dish.price.toFixed(2)}</span>
        <span class="dish-add-btn add-btn">+ Add</span>
      </div>
    `;
    grid.appendChild(card);
  });
}

function filterMenu() {
  renderMenu();
}

function filterDishes() {
  renderMenu();
}

// Live Cart: Supports New Orders & Repeat Add-on items
function addToCart(dishId) {
  const dish = menuData.find(d => d.id === dishId);
  if (!dish) return;

  const existing = cart.find(i => i.id === dishId);
  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({
      id: dish.id,
      name: dish.name,
      price: dish.price,
      qty: 1
    });
  }

  if (currentViewingOrder) {
    renderRunningTableOrder();
  } else {
    renderCart();
  }
}

function updateCartQty(dishId, delta) {
  const item = cart.find(i => i.id === dishId);
  if (!item) return;

  item.qty += delta;
  if (item.qty <= 0) {
    cart = cart.filter(i => i.id !== dishId);
  }

  if (currentViewingOrder) {
    renderRunningTableOrder();
  } else {
    renderCart();
  }
}

function clearCart() {
  if (currentViewingOrder && cart.length > 0) {
    cart = [];
    renderRunningTableOrder();
    return;
  }

  cart = [];
  selectedTable = null;
  currentViewingOrder = null;

  const titleEl = document.querySelector('.cart-title');
  if (titleEl) titleEl.textContent = 'New Order Cart';

  const nameInput = document.getElementById('cust-name');
  const phoneInput = document.getElementById('cust-phone');
  const tableLabel = document.getElementById('selected-table-label');
  if (nameInput) { nameInput.value = ''; nameInput.disabled = false; }
  if (phoneInput) { phoneInput.value = ''; phoneInput.disabled = false; }
  if (tableLabel) tableLabel.textContent = 'None';

  restorePunchOrderButton();
  renderTables();
  renderCart();
}

function calculateCartTotals() {
  const subtotal = cart.reduce((acc, i) => acc + (i.price * i.qty), 0);
  const cgst = (subtotal * taxSettings.cgst) / 100;
  const sgst = (subtotal * taxSettings.sgst) / 100;
  const grandTotal = subtotal + cgst + sgst;
  return { subtotal, cgst, sgst, grandTotal };
}

function renderCart() {
  if (currentViewingOrder) return;

  const container = document.getElementById('cart-items-list') || document.getElementById('cart-items-container');
  if (!container) return;
  container.innerHTML = '';

  const subTotalEl = document.getElementById('sub-total-val') || document.getElementById('summary-subtotal');
  const cgstValEl = document.getElementById('cgst-val');
  const sgstValEl = document.getElementById('sgst-val');
  const grandEl = document.getElementById('grand-total-val') || document.getElementById('summary-grand');
  const submitBtn = document.getElementById('btn-submit-order');

  if (cart.length === 0) {
    container.innerHTML = `
      <div class="empty-cart">
        <div class="empty-cart-icon">🛒</div>
        <p>Your cart is empty</p>
        <small>Click on any food dish to add to this order</small>
      </div>
    `;
    if (subTotalEl) subTotalEl.textContent = '₹0.00';
    if (cgstValEl) cgstValEl.textContent = '₹0.00';
    if (sgstValEl) sgstValEl.textContent = '₹0.00';
    if (grandEl) grandEl.textContent = '₹0.00';
    if (submitBtn) submitBtn.disabled = true;
    return;
  }

  if (submitBtn) submitBtn.disabled = false;

  cart.forEach(item => {
    const row = document.createElement('div');
    row.className = 'cart-item-row';
    row.innerHTML = `
      <div class="cart-item-info">
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-rate">&#8377;${item.price.toFixed(2)} / unit</div>
      </div>
      <div class="cart-item-controls">
        <button class="qty-btn" onclick="updateCartQty('${item.id}', -1)">-</button>
        <span class="qty-val">${item.qty}</span>
        <button class="qty-btn" onclick="updateCartQty('${item.id}', 1)">+</button>
      </div>
      <div class="cart-item-total">&#8377;${(item.price * item.qty).toFixed(2)}</div>
    `;
    container.appendChild(row);
  });

  const totals = calculateCartTotals();
  if (subTotalEl) subTotalEl.textContent = '₹' + totals.subtotal.toFixed(2);
  if (cgstValEl) cgstValEl.textContent = '₹' + totals.cgst.toFixed(2);
  if (sgstValEl) sgstValEl.textContent = '₹' + totals.sgst.toFixed(2);
  if (grandEl) grandEl.textContent = '₹' + totals.grandTotal.toFixed(2);
}

// Order Submission for Fresh New Order
async function submitOrder() {
  if (cart.length === 0) {
    alert('Please add items to cart before submitting order!');
    return;
  }

  if (currentOrderType === 'Dine-In' && !selectedTable) {
    alert('Please select a dining table for Dine-In order!');
    return;
  }

  const custName = (document.getElementById('cust-name')?.value || '').trim() || 'Walk-in Guest';
  const custPhone = (document.getElementById('cust-phone')?.value || '').trim();

  const cartSnapshot = cart.map(i => ({
    name: i.name,
    qty: parseInt(i.qty) || 1,
    price: parseFloat(i.price) || 0
  }));

  const verifiedOrder = {
    Order_Type: currentOrderType,
    Customer_Name: custName,
    order_items: cart.map(i => ({
      Food_Menu: i.id,
      Quantity: parseInt(i.qty),
      Price: parseFloat(i.price)
    }))
  };

  if (selectedTable && selectedTable.id && currentOrderType === 'Dine-In') {
    verifiedOrder.Dining_Tables = selectedTable.id;
  }
  if (custPhone) {
    verifiedOrder.Customer_Phone = custPhone;
  }

  if (isZohoReady && ZOHO.CREATOR) {
    const submitBtn = document.getElementById('btn-submit-order');
    if (submitBtn) {
      submitBtn.textContent = 'Submitting...';
      submitBtn.disabled = true;
    }

    try {
      const resp = await ZOHO.CREATOR.API.addRecord({
        formName: 'Orders',
        data: { data: verifiedOrder }
      });

      if (resp && (resp.code === 3000 || resp.result === 'success' || (resp.data && resp.data.ID))) {
        const orderId = resp.data ? (resp.data.ID || resp.data.id) : null;

        if (orderId) {
          try {
            localStorage.setItem('pos_order_items_' + orderId, JSON.stringify(cartSnapshot));
          } catch(e) {}

          // Add initial KOT ticket for the kitchen
          const nowTime = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
          const cleanNum = (typeof formatOrderNumber === 'function') ? formatOrderNumber(null, orderId) : 'ORD-1';
          kotTickets.push({
            id: 'kot_' + orderId + '_1',
            orderId: orderId,
            orderNumber: cleanNum,
            table: selectedTable ? selectedTable.name : currentOrderType,
            customer: custName,
            time: nowTime,
            isAddon: false,
            items: cartSnapshot,
            status: 'New Order'
          });
          saveKOTTickets();
        }

        if (selectedTable && selectedTable.id && currentOrderType === 'Dine-In') {
          selectedTable.status = 'occupied';
          try {
            await ZOHO.CREATOR.API.updateRecord({
              reportName: 'All_Dining_Tables',
              id: selectedTable.id,
              data: {
                data: {
                  Status: 'Occupied'
                }
              }
            });
          } catch(tblErr) {
            console.warn('Could not update table status:', tblErr);
          }
        }

        const dispNum = (typeof formatOrderNumber === 'function') ? formatOrderNumber(null, orderId) : 'ORD-1'; alert('✅ Order #' + dispNum + ' placed successfully & sent to Kitchen KOT!');
        clearCart();

        await loadLiveOrders();
        await loadAllZohoData();
        switchView('kot');
      } else {
        alert('Notice: ' + (resp.message || JSON.stringify(resp)));
      }
    } catch (err) {
      console.error('Submit error:', err);
      alert('Could not submit order: ' + (err.responseText || err.message));
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span class="btn-icon">⚡</span> Punch Order & Send to KOT';
      }
    }
  } else {
    alert('Order placed successfully (Standalone Mode)!');
    clearCart();
    switchView('kot');
  }
}
