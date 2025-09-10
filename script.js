/* ================= CONFIG ================= */
const URL_BASE = "https://script.google.com/macros/s/AKfycbxqEGlc9HNOQY6zX4-j_221-U7RkBsczez26UgWlbzXL6oRJycMItP14NLdpY58gipJHA/exec"; // <<< ใส่ลิงก์ /exec ของ GAS
const API_KEY = 'MEDREQ-KEY-2025-1234567890-ABC-NAREERATROUNGRONG-DEFG';

/* ====== CORS bypass (dev) ====== */
const CORS_PROXY = 'https://cors.isomorphic-git.org/';
function looksLikeCorsOrNetwork(err) {
  const s = String(err?.message || err || '').toLowerCase();
  return s.includes('cors') || s.includes('network') || s.includes('failed to fetch') || s.includes('err_failed') || s.includes('typeerror');
}
async function fetchJSON(url, options) {
  try {
    const r = await fetch(url, options);
    if (!r || r.type === 'opaque') throw new Error('Opaque (likely CORS)');
    const data = await r.json();
    if (!r.ok) throw new Error(`HTTP ${r.status} :: ${JSON.stringify(data)}`);
    return data;
  } catch (err1) {
    if (!looksLikeCorsOrNetwork(err1)) throw err1;
    const proxyUrl = CORS_PROXY + url;
    const opt2 = { ...options }; if (opt2.headers) delete opt2.headers;
    const r2 = await fetch(proxyUrl, opt2);
    if (!r2 || r2.type === 'opaque') throw new Error('Proxy opaque');
    const data2 = await r2.json();
    if (!r2.ok) throw new Error(`HTTP ${r2.status} :: ${JSON.stringify(data2)}`);
    return data2;
  }
}

/* ================ Shortcuts ================ */
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const norm = s => String(s || '').trim().toUpperCase();

/* ================ Global State ================ */
const S = {
  returned: [],
  requests: [],
  available: [],
  borrowed: [],
  equipList: [],
  equipMap: new Map(), // MPC -> {status,type}
  sel: null,
  qr: { stream: null, raf: 0 },
  ret: { stream: null, raf: 0 }
};

/* ================ API ================ */
function apiGet(action, params = {}) {
  const url = new URL(URL_BASE);
  url.searchParams.set('action', action);
  url.searchParams.set('key', API_KEY);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  });

  return fetchJSON(url.toString(), { method: 'GET' });
}

function apiPost(action, body) {
  const url = new URL(URL_BASE);
  url.searchParams.set('action', action);
  url.searchParams.set('key', API_KEY);

  return fetchJSON(url.toString(), { method: 'POST', body: JSON.stringify(body || {}) });
}

function toast(m) { const t = $('#toast'); if (!t) return; t.textContent = m; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2400); }

/* ================ Load & Render ================ */
async function loadAll() {
  try {
    const [reqRes, availRes, equipRes, borRes, returnedRes] = await Promise.all([
      apiGet('getAllRequests'),
      apiGet('getAvailableEquipment'),
      apiGet('getEquipmentList'),
      apiGet('getBorrowedEquipment'),
      apiGet('getReturned'),
    ]);

    S.requests = Array.isArray(reqRes?.data) ? reqRes.data : [];
    S.available = Array.isArray(availRes?.data) ? availRes.data : [];
    S.equipList = Array.isArray(equipRes?.data) ? equipRes.data : [];
    S.borrowed = Array.isArray(borRes?.data) ? borRes.data : [];
    S.returned = Array.isArray(returnedRes?.data) ? returnedRes.data : [];

    S.equipMap.clear();
    S.equipList.forEach(r => {
      const code = norm(r['MPC Code']); if (!code) return;
      S.equipMap.set(code, { status: String(r['Status'] || ''), type: String(r['Medical Equipment'] || '') });
    });

    renderAvailable();
    renderRequests();
    renderBorrowed();
    renderReport();
    fillTypeOptions();
  } catch (e) {
    console.error(e);
    toast('โหลดข้อมูลล้มเหลว');
  }
}

function formatTimestamp(timestamp) {
  const date = new Date(timestamp);

  // ใช้ Intl.DateTimeFormat เพื่อจัดรูปแบบวันที่และเวลา
  const formattedDate = new Intl.DateTimeFormat('th-TH', {
    day: '2-digit',
    month: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false // ใช้เวลาในรูปแบบ 24 ชั่วโมง
  }).format(date);

  return formattedDate;
}

function renderAvailable() {
  const box = $('#available-equipment-list'); if (!box) return;
  if (!S.available.length) { box.innerHTML = '<div class="muted">ไม่มีข้อมูล</div>'; return; }
  box.innerHTML = S.available.map(a => `
    <div class="available-item">
      <div class="name">${a.equipmentType || '-'}</div>
      <div class="count">${a.availableCount ?? 0}</div>
    </div>
  `).join('');
}

function renderRequests() {
  const list = $('#borrow-list'); if (!list) return;

  // Filter requests that are still pending or have not been accepted
  const data = S.requests.filter(r => String(r.status || '').toLowerCase() === 'pending');

  // If no data left after filtering, show a message
  if (!data.length) {
    list.innerHTML = '<div class="muted">ไม่มีคำขอที่ต้องดำเนินการ</div>';
    return;
  }

  list.innerHTML = data.map(r => {
    const id = r.id || r.ID || r.Id || '';
    const qty = Number(r.quantity || 1);
    const st = (r.status || 'pending').toLowerCase();
    const badge = st === 'accepted' ? 'success' : (st === 'pending' ? 'warning' : '');
    return `
      <div class="item">
        <div class="head">
          <span class="title">${r.equipmentType || '-'}</span>
          <span class="badge ${badge}">${r.status || 'pending'}</span>
        </div>
        <div class="meta">
          <p><b>Requestor:</b> ${r.borrowerName || '-'} (${r.department || '-'})</p>
          <p><b>Quantity:</b> ${qty} &nbsp; <b>Notes:</b> ${r.notes || '-'}</p>
          <p><b>Required Before:</b> ${r.requiredTime || '-'}</p>
        </div>
        <div class="actions end">
          <button class="btn primary btn-receive"
            data-id="${id}" data-borrower="${r.borrowerName || ''}"
            data-dept="${r.department || ''}" data-type="${r.equipmentType || ''}"
            data-qty="${qty}">Received</button>
        </div>
      </div>`;
  }).join('');

  $$('.btn-receive').forEach(b => {
    b.addEventListener('click', () => {
      S.sel = {
        id: b.dataset.id,
        borrowerName: b.dataset.borrower,
        department: b.dataset.dept,
        equipmentType: b.dataset.type,
        quantity: Number(b.dataset.qty || 1)
      };
      openReceive();
    });
  });
}


function renderBorrowed() {
  const box = $('#borrowed-list');
  if (!box) return;
  if (!S.returned.length) {
    box.innerHTML = '<div class="muted">ไม่มีข้อมูล</div>'; return;
  }

  const table = `
    <table>
      <thead>
        <tr>
          <th>Timestamp</th>
          <th>Employee No.</th>
          <th>Department</th>
          <th>Medical Equipment</th>
          <th>MPC Code</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${S.returned.filter(r => String(r['Status']).trim().toLowerCase() === "pending").slice(-20).reverse().map(r => `
          <tr>
            <td>${formatTimestamp(r['Timestamp'])}</td>
            <td>${r['Employee No.']}</td>
            <td>${r['Department']}</td>
            <td>${r['Medical Equipment']}</td>
            <td>${r['MPC Code']}</td>
            <td>
              <button class="btn action-btn">Return</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  box.innerHTML = table;

  $$('.action-btn').forEach(btn => {
    btn.addEventListener('click', openReturn);
  });
}


/* ================ Report ================ */
function renderReport() {
  const approved = S.requests.filter(r => String(r.status || '').toLowerCase() === 'accepted').length;
  const pending = S.requests.filter(r => String(r.status || '').toLowerCase() !== 'accepted').length;
  const over3d = S.borrowed.filter(r => {
    const t = new Date(r.timestamp || r.Timestamp || r['Timestamp']);
    if (!t || isNaN(t)) return false;
    const diff = (Date.now() - t.getTime()) / (1000 * 60 * 60 * 24);
    return r.isReturned === false && diff > 3;
  }).length;

  $('#count-approved') && ($('#count-approved').textContent = approved);
  $('#count-pending') && ($('#count-pending').textContent = pending);
  $('#count-overdue') && ($('#count-overdue').textContent = over3d);

  const list = $('#report-list');
  if (!list) return;

  // แสดงข้อมูลจาก Borrowed: MPC / Equipment / Dept / Borrow time
  if (!S.borrowed.length) {
    list.innerHTML = '<div class="muted">ยังไม่มีบันทึกการยืม</div>';
    return;
  }


  const rows = S.borrowed.slice().reverse();
  list.innerHTML = rows.map(r => {
    const mpc = r['MPC Code'] || '-';
    const type = r['Equipment Type'] || '-';
    const dept = r['Department'] || '-';
    const time = r['Date Borrowed'] || r['Timestamp'] || '-';
    const isReturned = r['isReturned'] || false; // ตรวจสอบว่า `isReturned` เป็น false หรือไม่

    const timestamp = new Date(r['Date Borrowed'] || r['Timestamp']);
    const diff = (Date.now() - timestamp.getTime()) / (1000 * 60 * 60 * 24); // คำนวณจำนวนวันที่ผ่านไป

    // ตรวจสอบว่าเกิน 3 วัน และยังไม่ได้คืน
    const isOverdue = diff > 3 && !isReturned;

    // เพิ่มคลาส 'overdue' ถ้าเกิน 3 วันและยังไม่คืน
    const overdueClass = isOverdue ? 'overdue' : '';

    return `
    <div class="item ${overdueClass}">
      <div class="head">
        <span class="title">${mpc}</span>
        <span class="badge success">${type}</span>
      </div>
      <div class="meta">
        <p><b>Medical Equipment:</b> ${type} / <b>Department:</b> ${dept}</p>
        <p><b>Borrow Time:</b> ${time}</p>
      </div>
    </div>`;
  }).join('');



  const inp = $('#report-search');
  if (inp) {
    inp.oninput = e => {
      const q = e.target.value.trim().toLowerCase();
      Array.from(list.children).forEach(div => {
        div.style.display = div.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    };
  }
}

/* ================ Receive modal ================ */
const R = {
  el: $('#receive-modal'),
  close: $('#receive-close'),
  title: $('#receive-title'),
  desc: $('#receive-desc'),
  dept: $('#receive-dept'),
  input: $('#receive-scan-input'),
  list: $('#receive-scanned-list'),
  submit: $('#receive-submit'),
  status: $('#receive-status'),
  qrvideo: $('#qr-video'),
  qrcanvas: $('#qr-canvas'),
  qrstart: $('#qr-start'),
  qrstop: $('#qr-stop')
};

function openReceive() {
  const r = S.sel; if (!r) return;
  R.title.textContent = 'รับเครื่องมือแพทย์';
  R.desc.innerHTML = `<b>ID:</b> ${r.id}<br><b>ผู้ยืม:</b> ${r.borrowerName || '-'}<br><b>ประเภท:</b> ${r.equipmentType || '-'}<br><b>จำนวน:</b> ${r.quantity}`;
  R.dept.value = r.department || '';
  R.input.value = ''; R.list.innerHTML = ''; R.status.textContent = '';
  R.el.style.display = 'flex'; R.input.focus();
}

function closeReceive() { stopQR(); R.el.style.display = 'none'; }

function addMPCToList(value) {
  const r = S.sel; if (!r) return;
  const code = norm(value);
  if (!/^MPC-\w+-\d+$/i.test(code)) {
    toast('รูปแบบไม่ถูกต้อง (เช่น MPC-9-12345)');
    return;
  }

  const m = S.equipMap.get(code);
  if (!m) {
    toast(`ไม่พบ ${code} ในระบบ`);
    return;
  }
  if (m.status !== 'Available') {
    toast(`${code} ไม่พร้อมใช้งาน (สถานะ: ${m.status})`); return;
  }
  if (String(m.type) !== String(r.equipmentType)) {
    toast(`${code} ไม่ตรงประเภท (${m.type} ≠ ${r.equipmentType})`); return;
  }
  if (Array.from(R.list.children).some(li => li.dataset.code === code)) {
    toast('รหัสซ้ำ'); return;
  }
  if (R.list.children.length >= r.quantity) {
    toast('ครบจำนวนแล้ว'); return;
  }

  const li = document.createElement('li');
  li.className = 'chip'; li.dataset.code = code;
  li.innerHTML = `${code} <button aria-label="remove">&times;</button>`;
  li.querySelector('button').onclick = () => li.remove();
  R.list.appendChild(li);
}

/* QR for receive */
function startQR() {
  if (S.qr.stream) return;
  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
    .then(stream => { S.qr.stream = stream; R.qrvideo.srcObject = stream; R.qrvideo.style.display = 'block'; loopQR(); })
    .catch(e => { console.error(e); toast('เปิดกล้องไม่ได้'); });
}
function stopQR() {
  if (S.qr.raf) cancelAnimationFrame(S.qr.raf); S.qr.raf = 0;
  if (S.qr.stream) { S.qr.stream.getTracks().forEach(t => t.stop()); S.qr.stream = null; }
  R.qrvideo.style.display = 'none';
}
function loopQR() {
  const v = R.qrvideo, c = R.qrcanvas, ctx = c.getContext('2d');
  const draw = () => {
    if (!S.qr.stream) return;
    c.width = v.videoWidth || 640; c.height = v.videoHeight || 480;
    ctx.drawImage(v, 0, 0, c.width, c.height);
    try {
      const im = ctx.getImageData(0, 0, c.width, c.height);
      const qr = jsQR(im.data, im.width, im.height);
      if (qr?.data) {
        const val = norm(qr.data);
        if (val.startsWith('MPC-')) { addMPCToList(val); stopQR(); }
      }
    } catch (_) { }
    S.qr.raf = requestAnimationFrame(draw);
  };
  S.qr.raf = requestAnimationFrame(draw);
}

async function submitReceive() {
  const r = S.sel; if (!r || !r.id) { R.status.textContent = 'ไม่พบ ID'; return; }
  if (R.input.value.trim()) { addMPCToList(R.input.value); R.input.value = ''; }
  const codes = Array.from(R.list.children).map(li => li.dataset.code);
  if (codes.length === 0) { toast('ต้องมีอย่างน้อย 1 รหัส'); return; }
  if (codes.length !== r.quantity) { toast(`ต้องการ ${r.quantity} รหัส (ปัจจุบัน ${codes.length})`); return; }

  R.submit.disabled = true; R.status.textContent = 'กำลังบันทึก...';
  try {
    const res = await apiPost('recordBorrow', { requestId: r.id, department: R.dept.value || r.department || '', mpcCodes: codes });
    if (res?.success) { toast('บันทึกสำเร็จ'); closeReceive(); await loadAll(); }
    else { R.status.textContent = res?.message || 'บันทึกล้มเหลว'; toast(res?.message || 'บันทึกล้มเหลว'); }
  } catch (e) { console.error(e); R.status.textContent = 'Failed to fetch'; toast('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้'); }
  finally { R.submit.disabled = false; }
}

/* ================ Return modal ================ */
const RET = {
  el: $('#return-modal'),
  close: $('#return-close'),
  input: $('#return-input'),
  list: $('#return-scanned-list'),
  submit: $('#return-submit'),
  status: $('#return-status'),
  v: $('#return-video'),
  c: $('#return-canvas'),
  qstart: $('#return-qr-start'),
  qstop: $('#return-qr-stop')
};

function openReturn() {
  RET.input.value = '';
  RET.list.innerHTML = '';
  RET.status.textContent = '';
  RET.el.style.display = 'flex';
  RET.input.focus();
}

function closeReturn() {
  stopQRReturn();
  RET.el.style.display = 'none';
}

function addReturn(code) {
  const c = norm(code);
  if (!/^MPC-\w+-\d+$/i.test(c)) {
    toast('รูปแบบ MPC ไม่ถูกต้อง'); return;
  }
  if (Array.from(RET.list.children).some(li => li.dataset.code === c))
    return;

  const li = document.createElement('li');
  li.className = 'chip';
  li.dataset.code = c;
  li.innerHTML = `${c} <button aria-label="remove">&times;</button>`;
  li.querySelector('button').onclick = () => li.remove();
  RET.list.appendChild(li);
}

function startQRReturn() {
  if (S.ret.stream) return;
  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
    .then(stream => { S.ret.stream = stream; RET.v.srcObject = stream; RET.v.style.display = 'block'; loopQRReturn(); })
    .catch(e => { console.error(e); toast('เปิดกล้องไม่ได้'); });
}

function stopQRReturn() {
  if (S.ret.raf) cancelAnimationFrame(S.ret.raf); S.ret.raf = 0;
  if (S.ret.stream) { S.ret.stream.getTracks().forEach(t => t.stop()); S.ret.stream = null; }
  RET.v.style.display = 'none';
}

function loopQRReturn() {
  const v = RET.v, c = RET.c, ctx = c.getContext('2d');
  const draw = () => {
    if (!S.ret.stream) return;
    c.width = v.videoWidth || 640; c.height = v.videoHeight || 480;
    ctx.drawImage(v, 0, 0, c.width, c.height);
    try {
      const im = ctx.getImageData(0, 0, c.width, c.height);
      const qr = jsQR(im.data, im.width, im.height);
      if (qr?.data) { const s = norm(qr.data); if (s.startsWith('MPC-')) { addReturn(s); stopQRReturn(); } }
    } catch (_) { }
    S.ret.raf = requestAnimationFrame(draw);
  };
  S.ret.raf = requestAnimationFrame(draw);
}

async function submitReturn() {
  if (RET.input.value.trim()) {
    addReturn(RET.input.value); RET.input.value = '';
  }

  const codes = Array.from(RET.list.children).map(li => li.dataset.code);

  if (!codes.length) {
    toast('ใส่รหัสอย่างน้อย 1 รายการ');
    return;
  }

  RET.submit.disabled = true; RET.status.textContent = 'กำลังบันทึก...';

  try {
    for (const code of codes) {
      const res = await apiPost('recordReturned', {
        mpcCode: code
      });

      if (!res?.success) {
        RET.status.textContent = res?.message || 'บันทึกคืนล้มเหลว';
        toast(res?.message || 'บันทึกคืนล้มเหลว');
        RET.submit.disabled = false; return;
      }
    }

    toast('บันทึกคืนเรียบร้อย'); closeReturn();

    await loadAll();
  } catch (e) {
    console.error(e);
    RET.status.textContent = 'Failed to fetch';
    toast('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้');
  }
  finally { RET.submit.disabled = false; }
}

/* ================ Stats (เดิม) ================ */
let chartDept, chartTypeMonth, chartMonth;

function fillTypeOptions() {
  const sel = $('#month-type');
  if (!sel) return;
  sel.innerHTML = '';

  // ดึงชนิดอุปกรณ์จาก S.equipList
  const set = new Set(S.equipList.map(r => String(r['Medical Equipment'] || '')).filter(Boolean));
  Array.from(set).sort().forEach(t => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    sel.appendChild(opt);
  });
}

// --- แผนก ---
async function loadDeptStats() {
  const m = $('#dept-month')?.value || new Date().toISOString().slice(0, 7);
  const res = await apiGet('getBorrowStatsByDept', { month: m });
  const data = Array.isArray(res?.data) ? res.data : [];

  const labels = [...new Set(data.map(x => x.department))];
  const counts = labels.map(l => data.filter(x => x.department === l).length);

  chartDept?.destroy();

  const ctx = $('#chart-dept');
  if (!ctx) return;

  chartDept = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Borrow by Dept', data: counts, backgroundColor: 'rgba(75, 192, 192, 0.6)', borderColor: 'rgba(75, 192, 192,1)', borderWidth: 1 }] },
    options: { responsive: true, scales: { y: { beginAtZero: true, ticks: { stepSize: 1, precision: 0 } } } }
  });
}

// --- Type per Month ---
async function loadTypeStats() {
  const m = $('#type-dept-month')?.value || new Date().toISOString().slice(0, 7);
  const res = await apiGet('getBorrowStatsByTypeEquipment', { month: m });
  const data = Array.isArray(res?.data) ? res.data : [];
  const labels = data.map(x => x.equipmentType || 'Unknown');
  const counts = data.map(x => Number(x.quantity || 0));

  chartTypeMonth?.destroy();

  const ctxEl = $('#chart-type-month');
  if (!ctxEl) return;
  const ctx = ctxEl.getContext('2d');

  chartTypeMonth = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: `Borrow per Equipment Type (${m})`,
        data: counts,
        backgroundColor: 'rgba(54, 162, 235, 0.6)',
        borderColor: 'rgba(54, 162, 235,1)',
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      scales: {
        y: { beginAtZero: true, ticks: { stepSize: 1, precision: 0 } }
      }
    }
  });

  $('#stats-status') && ($('#stats-status').textContent = `Total borrows in ${m}: ${counts.reduce((a, b) => a + b, 0)}`);
}



// --- Specific Equipment per Month ---
async function loadMonthStats() {
  const m = $('#month-month')?.value || new Date().toISOString().slice(0, 7);
  const t = $('#month-type')?.value || '';
  if (!t) { $('#stats-status') && ($('#stats-status').textContent = 'เลือกชนิดเครื่องก่อน'); return; }

  const res = await apiGet('getBorrowStatsByEquipment', { month: m, type: t });
  const data = Array.isArray(res?.data) ? res.data : [];

  const labels = data.map(item => item.mpcCode);
  const values = data.map(item => item.count);
  const total = values.reduce((a, b) => a + b, 0);

  chartMonth?.destroy();

  const ctx = $('#chart-month');
  if (!ctx) return;

  chartMonth = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: `Borrow count (${t})`,
        data: values,
        backgroundColor: 'rgba(255, 159, 64, 0.6)',
        borderColor: 'rgba(255, 159, 64,1)',
        borderWidth: 1
      }]
    },
    options: { responsive: true, scales: { y: { beginAtZero: true, ticks: { stepSize: 1, precision: 0 } } } }
  });

  $('#stats-status') && ($('#stats-status').textContent = `Total borrows for "${t}" in ${m}: ${total}`);
}



/* ================ Tabs (หลัก) ================ */
function switchTab(tab) {
  // เปลี่ยน active เฉพาะแท็บหลักใน header nav
  document.querySelectorAll('nav.tabs .tab')
    .forEach(b => b.classList.toggle('active', b.dataset.tab === tab));

  // แสดง/ซ่อนพาเนลหลัก
  $('#panel-requested')?.classList.toggle('hidden', tab !== 'requested');
  $('#panel-returned')?.classList.toggle('hidden', tab !== 'returned');
  $('#panel-report')?.classList.toggle('hidden', tab !== 'report');
  $('#panel-stats')?.classList.toggle('hidden', tab !== 'stats');
}

/* ================ Tabs (ย่อยใน Statistics) ================ */
function switchChartTab(mode) {
  document.querySelectorAll('#panel-stats .tabs.small .tab')
    .forEach(b => b.classList.toggle('active', b.dataset.chartTab === mode));

  $('#panel-chart-dept')?.classList.toggle('hidden', mode !== 'dept');
  $('#panel-chart-type-month')?.classList.toggle('hidden', mode !== 'type-month');
  $('#panel-chart-month')?.classList.toggle('hidden', mode !== 'month');

  if (mode === 'dept') loadDeptStats();
  else if (mode === 'month') { fillTypeOptions(); loadMonthStats(); }
  else loadTypeStats();
}


/* ================ Boot ================ */
document.addEventListener('DOMContentLoaded', async () => {
  try { await loadAll(); } catch (_) { }

  // --- แท็บหลัก: จำกัด selector เฉพาะ nav.tabs เท่านั้น ---
  document.querySelectorAll('nav.tabs .tab')
    .forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));

  // ปุ่มรีเฟรช
  $('#btn-refresh-borrow')?.addEventListener('click', loadAll);
  $('#btn-refresh-return')?.addEventListener('click', loadAll);
  $('#btn-refresh-report')?.addEventListener('click', loadAll);
  $('#btn-refresh-stats')?.addEventListener('click', () => {
    // รีโหลดตามแท็บย่อยที่กำลัง active
    const activeChart = document.querySelector('#panel-stats .tabs.small .tab.active')?.dataset.chartTab || 'dept';
    switchChartTab(activeChart);
  });
  $('#btn-load-stats')?.addEventListener('click', () => {
    const activeChart = document.querySelector('#panel-stats .tabs.small .tab.active')?.dataset.chartTab || 'dept';
    switchChartTab(activeChart);
  });

  // --- แท็บย่อยใน Statistics ---
  document.querySelectorAll('#panel-stats .tabs.small .tab')
    .forEach(b => b.addEventListener('click', () => switchChartTab(b.dataset.chartTab)));

  // Receive modal
  R.close?.addEventListener('click', closeReceive);
  window.addEventListener('click', e => { if (e.target === R.el) closeReceive(); });
  R.input?.addEventListener('keydown', e => { if (e.key === 'Enter') { addMPCToList(R.input.value); R.input.value = ''; } });
  R.qrstart?.addEventListener('click', startQR);
  R.qrstop?.addEventListener('click', stopQR);
  R.submit?.addEventListener('click', submitReceive);

  // Return modal
  $('#btn-open-return')?.addEventListener('click', openReturn);
  RET.close?.addEventListener('click', closeReturn);
  window.addEventListener('click', e => { if (e.target === RET.el) closeReturn(); });
  RET.input?.addEventListener('keydown', e => { if (e.key === 'Enter') { addReturn(RET.input.value); RET.input.value = ''; } });
  RET.qstart?.addEventListener('click', startQRReturn);
  RET.qstop?.addEventListener('click', stopQRReturn);
  RET.submit?.addEventListener('click', submitReturn);

  // default months
  const ym = new Date().toISOString().slice(0, 7);
  const dm = $('#dept-month');
  if (dm) dm.value = ym;
  const mm = $('#month-month');
  if (mm) mm.value = ym;
  const tm = $('#type-dept-month')
  if (tm) tm.value = ym;

  // ให้ load ใหม่ทุกครั้งที่เปลี่ยน month หรือ type
  $('#month-month')?.addEventListener('change', loadMonthStats);
  $('#month-type')?.addEventListener('change', loadMonthStats);

  // ตั้งค่าเริ่มต้น: อยู่หน้าไหนก็ได้ตามต้องการ
  // switchTab('requested');   // ถ้าต้องการเริ่มที่หน้า Requested
  // หรือถ้าอยากทดสอบกราฟทันที:
  // switchTab('stats');       
  switchChartTab('dept');     // เริ่มที่กราฟสถิติแต่ละแผนก
});
