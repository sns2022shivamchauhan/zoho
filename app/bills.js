/**
 * Module: Active Bills & Settlement (bills.js)
 * Grid listing active orders, payment settlement, releasing tables, and printing receipts
 */

async function refreshBills() {
  if (isZohoReady) {
    await loadLiveOrders();
  }
  renderActiveOrders();
}

function renderActiveOrders() {
  const tbody = document.getElementById('orders-table-body') || document.getElementById('active-orders-body');
  if (!tbody) return;

  if (ordersData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: var(--text-muted); padding: 30px;">No active orders found.</td></tr>`;
    return;
  }

  tbody.innerHTML = ordersData.map(o => {
    const isPaid = o.payment === 'Paid';
    let statusClass = 'new';
    if (o.status === 'Cooking in Kitchen') statusClass = 'cooking';
    else if (o.status === 'Served' || o.status === 'Completed') statusClass = 'served';

    const grand = calculateOrderTotal(o);
    const isTakeaway = o.type === 'Takeaway' || o.table === 'Takeaway';
    const isDelivery = o.type === 'Delivery' || o.table === 'Delivery';

    const itemsSummary = (o.items && o.items.length > 0)
      ? o.items.map(it => `${it.name} (${it.qty})`).join(', ')
      : 'Details in KOT';

    return `
      <tr>
        <td><strong>#${o.orderNumber}</strong></td>
        <td>${o.time || 'Just now'}</td>
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
            <strong>Table ${o.table}</strong>
          `)}
        </td>
        <td><span style="font-size: 11px; font-weight: 600; color: #475569;">${o.type || 'Dine-In'}</span></td>
        <td>${o.customer}</td>
        <td style="max-width: 220px; font-size: 11px; color: var(--text-muted); word-break: break-word;">${itemsSummary}</td>
        <td><strong>₹${grand.toFixed(2)}</strong></td>
        <td><span class="status-pill status-${statusClass}">${o.status}</span></td>
        <td><span class="status-pill status-${isPaid ? 'paid' : 'unpaid'}">${o.payment}</span></td>
        <td>
          ${!isPaid ? `
            <button class="table-action-btn pay" onclick="payAndCompleteOrder('${o.id}')">💵 Pay Bill</button>
          ` : `
            <span style="color: var(--success); font-size: 11px; font-weight: 700;">Paid</span>
          `}
          <button class="table-action-btn" onclick="openReceipt('${o.id}')">🖨️ Print Bill</button>
        </td>
      </tr>
    `;
  }).join('');
}

function calculateOrderTotal(o) {
  if (o.total && o.total > 0) return o.total;
  const subtotal = o.items.reduce((acc, it) => acc + (it.price * it.qty), 0);
  const tax = (subtotal * (taxSettings.cgst + taxSettings.sgst)) / 100;
  return subtotal + tax;
}

async function payAndCompleteOrder(orderId) {
  const o = ordersData.find(item => String(item.id) === String(orderId) || String(item.orderNumber) === String(orderId));
  if (!o) return;

  o.payment = 'Paid';
  o.status = 'Completed';

  const isTakeaway = o.type === 'Takeaway' || o.table === 'Takeaway';
  const isDelivery = o.type === 'Delivery' || o.table === 'Delivery';

  if (isZohoReady && ZOHO.CREATOR) {
    try {
      await ZOHO.CREATOR.API.updateRecord({
        reportName: 'All_Orders',
        id: orderId,
        data: {
          data: {
            Payment_Status: 'Paid',
            Order_Status: 'Completed'
          }
        }
      });
    } catch (e) {
      console.warn('Zoho pay update error:', e);
    }

    if (o.table && !isTakeaway && !isDelivery && o.table !== 'None') {
      const tbl = tablesData.find(t => t.name === o.table);
      if (tbl && tbl.id) {
        tbl.status = 'available';
        try {
          await ZOHO.CREATOR.API.updateRecord({
            reportName: 'All_Dining_Tables',
            id: tbl.id,
            data: {
              data: {
                Status: 'Available'
              }
            }
          });
        } catch (tblErr) {
          console.warn('Release table in Zoho error:', tblErr);
        }
      }
    }
  }

  if (o.table && !isTakeaway && !isDelivery && o.table !== 'None') {
    const tbl = tablesData.find(t => t.name === o.table);
    if (tbl) {
      tbl.status = 'available';
    }
  }

  // Clear all active KOT tickets for this completed order
  if (typeof kotTickets !== 'undefined') {
    kotTickets = kotTickets.filter(t => String(t.orderId) !== String(orderId));
    if (typeof saveKOTTickets === 'function') saveKOTTickets();
  }

  syncTableOccupancy();
  renderActiveOrders();
  renderTables();
  renderKOT();

  if (isTakeaway) {
    alert(`✅ Bill for Takeaway Order #${o.orderNumber} (${o.customer}) is Paid!`);
  } else if (isDelivery) {
    alert(`✅ Bill for Delivery Order #${o.orderNumber} (${o.customer}) is Paid!`);
  } else {
    alert(`✅ Bill for Order #${o.orderNumber} is Paid! Table ${o.table} is now Available.`);
  }
}

function openReceipt(orderId) {
  const o = ordersData.find(item => String(item.id) === String(orderId) || String(item.orderNumber) === String(orderId));
  if (!o) {
    alert('Order details not found for receipt printing.');
    return;
  }

  const content = document.getElementById('receipt-content');
  if (!content) return;

  const subtotal = o.items.reduce((acc, it) => acc + (it.price * it.qty), 0);
  const cgst = (subtotal * taxSettings.cgst) / 100;
  const sgst = (subtotal * taxSettings.sgst) / 100;
  const grandTotal = o.total > 0 ? o.total : (subtotal + cgst + sgst);
  const isTakeaway = o.type === 'Takeaway' || o.table === 'Takeaway';
  const isDelivery = o.type === 'Delivery' || o.table === 'Delivery';

  content.innerHTML = `
    <div class="thermal-bill">
      <div class="bill-title">Khana Khajana</div>
      <div class="bill-subtitle">Smart Restaurant Terminal</div>
      <div class="bill-line"></div>
      <div class="bill-row">
        <span><strong>Order:</strong> #${o.orderNumber}</span>
        <span><strong>${isTakeaway ? 'Type' : (isDelivery ? 'Type' : 'Table')}:</strong> ${isTakeaway ? '📦 Takeaway' : (isDelivery ? '🛵 Delivery' : 'Table ' + o.table)}</span>
      </div>
      <div class="bill-row">
        <span><strong>Date:</strong> ${o.time}</span>
        <span><strong>Type:</strong> ${o.type}</span>
      </div>
      <div class="bill-row">
        <span><strong>Guest:</strong> ${o.customer}</span>
        <span><strong>Status:</strong> ${o.payment}</span>
      </div>
      <div class="bill-line"></div>
      <div style="font-weight: 700; margin-bottom: 4px;">Items:</div>
      ${o.items.length > 0 ? o.items.map(it => `
        <div class="bill-row">
          <span>${it.name} x ${it.qty}</span>
          <span>&#8377;${(it.price * it.qty).toFixed(2)}</span>
        </div>
      `).join('') : '<div style="font-size: 11px; padding: 4px 0;">Details in KOT</div>'}
      <div class="bill-line"></div>
      <div class="bill-row">
        <span>Subtotal:</span>
        <span>&#8377;${subtotal.toFixed(2)}</span>
      </div>
      <div class="bill-row">
        <span>CGST (${taxSettings.cgst}%):</span>
        <span>&#8377;${cgst.toFixed(2)}</span>
      </div>
      <div class="bill-row">
        <span>SGST (${taxSettings.sgst}%):</span>
        <span>&#8377;${sgst.toFixed(2)}</span>
      </div>
      <div class="bill-line"></div>
      <div class="bill-row" style="font-weight: 800; font-size: 14px;">
        <span>Grand Total:</span>
        <span>&#8377;${grandTotal.toFixed(2)}</span>
      </div>
      <div class="bill-line"></div>
      <div style="text-align: center; font-size: 11px; margin-top: 10px; color: #444;">
        ${isTakeaway ? 'Thank you for your Takeaway order!<br>Enjoy your food & please visit again.' : 'Thank you for dining with us!<br>Please visit again.'}
      </div>
    </div>
  `;

  const modal = document.getElementById('receipt-modal');
  if (modal) {
    modal.style.display = 'flex';
  }
}

function closeReceipt() {
  const modal = document.getElementById('receipt-modal');
  if (modal) {
    modal.style.display = 'none';
  }
}

function printReceipt() {
  const contentEl = document.getElementById('receipt-content');
  if (!contentEl) return;
  const content = contentEl.innerHTML;

  let printFrame = document.getElementById('receipt-print-frame');
  if (!printFrame) {
    printFrame = document.createElement('iframe');
    printFrame.id = 'receipt-print-frame';
    printFrame.style.position = 'fixed';
    printFrame.style.right = '0';
    printFrame.style.bottom = '0';
    printFrame.style.width = '0';
    printFrame.style.height = '0';
    printFrame.style.border = '0';
    document.body.appendChild(printFrame);
  }

  const doc = printFrame.contentWindow.document;
  doc.open();
  doc.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Invoice Receipt - Khana Khajana</title>
        <style>
          @page {
            size: 80mm auto;
            margin: 0;
          }
          @media print {
            body {
              margin: 0;
              padding: 10px;
            }
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Courier New", monospace;
            margin: 0;
            padding: 12px;
            color: #000;
            background: #fff;
            width: 72mm;
            font-size: 12px;
          }
          .thermal-bill {
            width: 100%;
          }
          .bill-title {
            font-size: 16px;
            font-weight: 800;
            text-align: center;
            text-transform: uppercase;
            margin-bottom: 2px;
          }
          .bill-subtitle {
            font-size: 11px;
            text-align: center;
            color: #444;
            margin-bottom: 8px;
          }
          .bill-line {
            border-bottom: 1px dashed #000;
            margin: 6px 0;
          }
          .bill-row {
            display: flex;
            justify-content: space-between;
            font-size: 12px;
            margin: 4px 0;
          }
        </style>
      </head>
      <body>
        ${content}
      </body>
    </html>
  `);
  doc.close();

  setTimeout(() => {
    try {
      printFrame.contentWindow.focus();
      printFrame.contentWindow.print();
    } catch(e) {
      console.warn('Iframe print error, falling back to window.print():', e);
      window.print();
    }
  }, 250);
}
