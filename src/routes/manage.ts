import { Hono } from "hono";
import { basicAuth } from "hono/basic-auth";
import { TanzakuService } from "../services/tanzaku.service";
import { EventService } from "../services/event.service";

const manage = new Hono<{ Bindings: CloudflareBindings }>();

// Basic認証ミドルウェア
manage.use("*", (c, next) => {
  const auth = basicAuth({
    username: c.env.ADMIN_ID || "admin",
    password: c.env.ADMIN_PWD || "password"
  });
  return auth(c, next);
});

const adminHtml = `<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>短冊管理画面</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: #f5f5f5;
            color: #333;
        }
        
        .header {
            background-color: #2c3e50;
            color: white;
            padding: 1rem 2rem;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        
        .header h1 {
            font-size: 1.5rem;
            font-weight: 600;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 2rem;
        }
        
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 1rem;
            margin-bottom: 2rem;
        }
        
        .stat-card {
            background: white;
            padding: 1.5rem;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            text-align: center;
        }
        
        .stat-number {
            font-size: 2rem;
            font-weight: bold;
            color: #3498db;
        }
        
        .stat-label {
            color: #7f8c8d;
            margin-top: 0.5rem;
        }
        
        .actions {
            background: white;
            padding: 1.5rem;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            margin-bottom: 2rem;
        }
        
        .btn {
            padding: 0.5rem 1rem;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 0.9rem;
            margin-right: 0.5rem;
            transition: all 0.2s;
        }
        
        .btn-primary {
            background-color: #3498db;
            color: white;
        }
        
        .btn-danger {
            background-color: #e74c3c;
            color: white;
        }
        
        .btn-warning {
            background-color: #f39c12;
            color: white;
        }
        
        .btn:hover {
            opacity: 0.8;
            transform: translateY(-1px);
        }
        
        .tanzaku-list {
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        
        .table {
            width: 100%;
            border-collapse: collapse;
        }
        
        .table th,
        .table td {
            padding: 1rem;
            text-align: left;
            border-bottom: 1px solid #ecf0f1;
        }
        
        .table th {
            background-color: #34495e;
            color: white;
            font-weight: 600;
        }
        
        .table tbody tr:hover {
            background-color: #f8f9fa;
        }
        
        .status-badge {
            padding: 0.25rem 0.5rem;
            border-radius: 12px;
            font-size: 0.75rem;
            font-weight: 600;
        }
        
        .status-visible {
            background-color: #d4edda;
            color: #155724;
        }
        
        .status-hidden {
            background-color: #f8d7da;
            color: #721c24;
        }
        
        .status-deleted {
            background-color: #d1ecf1;
            color: #0c5460;
        }
        
        .validation-badge {
            padding: 0.25rem 0.5rem;
            border-radius: 12px;
            font-size: 0.75rem;
            font-weight: 600;
        }
        
        .validation-ok {
            background-color: #d4edda;
            color: #155724;
        }
        
        .validation-ng {
            background-color: #f8d7da;
            color: #721c24;
        }
        
        .loading {
            text-align: center;
            padding: 2rem;
            color: #7f8c8d;
        }
        
        .error {
            background-color: #f8d7da;
            color: #721c24;
            padding: 1rem;
            border-radius: 4px;
            margin-bottom: 1rem;
        }
        
        .success {
            background-color: #d4edda;
            color: #155724;
            padding: 1rem;
            border-radius: 4px;
            margin-bottom: 1rem;
        }
        
        .checkbox {
            margin-right: 0.5rem;
        }
        
        .bulk-actions {
            display: none;
            padding: 1rem;
            background-color: #ecf0f1;
            border-bottom: 1px solid #bdc3c7;
        }
        
        .bulk-actions.show {
            display: block;
        }
        
        .select-all {
            margin-right: 1rem;
        }
        
        .search-box {
            display: flex;
            gap: 0.5rem;
            align-items: center;
            margin-bottom: 1rem;
        }
        
        .search-input {
            padding: 0.5rem;
            border: 1px solid #bdc3c7;
            border-radius: 4px;
            font-size: 0.9rem;
            width: 300px;
        }
        
        .search-input:focus {
            outline: none;
            border-color: #3498db;
            box-shadow: 0 0 0 2px rgba(52, 152, 219, 0.2);
        }
        
        .search-clear {
            background: none;
            border: none;
            color: #7f8c8d;
            cursor: pointer;
            padding: 0.5rem;
        }
        
        .search-clear:hover {
            color: #3498db;
        }
        
        .search-results {
            color: #7f8c8d;
            font-size: 0.9rem;
            margin-left: 1rem;
        }
        
        .modal {
            display: none;
            position: fixed;
            z-index: 1000;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0,0,0,0.5);
        }
        
        .modal-content {
            background-color: white;
            margin: 15% auto;
            padding: 2rem;
            border-radius: 8px;
            width: 80%;
            max-width: 500px;
            box-shadow: 0 4px 8px rgba(0,0,0,0.2);
        }
        
        .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 1rem;
        }
        
        .modal-title {
            font-size: 1.2rem;
            font-weight: 600;
            color: #2c3e50;
        }
        
        .close {
            background: none;
            border: none;
            font-size: 1.5rem;
            cursor: pointer;
            color: #7f8c8d;
        }
        
        .close:hover {
            color: #2c3e50;
        }
        
        .form-group {
            margin-bottom: 1rem;
        }
        
        .form-label {
            display: block;
            margin-bottom: 0.5rem;
            font-weight: 600;
            color: #2c3e50;
        }
        
        .form-input {
            width: 100%;
            padding: 0.5rem;
            border: 1px solid #bdc3c7;
            border-radius: 4px;
            font-size: 0.9rem;
        }
        
        .form-input:focus {
            outline: none;
            border-color: #3498db;
            box-shadow: 0 0 0 2px rgba(52, 152, 219, 0.2);
        }
        
        .form-select {
            width: 100%;
            padding: 0.5rem;
            border: 1px solid #bdc3c7;
            border-radius: 4px;
            font-size: 0.9rem;
            background-color: white;
        }
        
        .modal-actions {
            display: flex;
            gap: 0.5rem;
            justify-content: flex-end;
            margin-top: 1.5rem;
        }
        
        .btn-secondary {
            background-color: #95a5a6;
            color: white;
        }

        .sortable {
            cursor: pointer;
            user-select: none;
        }
        .sortable:hover {
            background-color: #2c3e50;
        }
        .sort-icon {
            font-size: 0.75rem;
            opacity: 0.7;
        }

        .event-section {
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            margin-bottom: 2rem;
            overflow: hidden;
        }

        .event-header {
            padding: 1rem 1.5rem;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 1rem;
            background-color: #34495e;
            color: white;
            user-select: none;
        }

        .event-header h2 {
            font-size: 1rem;
            font-weight: 600;
            margin: 0;
        }

        .event-header .active-badge {
            font-size: 0.9rem;
            opacity: 0.85;
        }

        .event-header .toggle-arrow {
            margin-left: auto;
        }

        .event-body {
            display: none;
        }

        .event-create {
            padding: 1rem 1.5rem;
            display: flex;
            gap: 0.5rem;
            align-items: center;
            border-bottom: 1px solid #ecf0f1;
            flex-wrap: wrap;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>短冊管理画面</h1>
    </div>
    
    <div class="container">
        <div id="message"></div>
        
        <div class="stats">
            <div class="stat-card">
                <div class="stat-number" id="totalCount">-</div>
                <div class="stat-label">総数</div>
            </div>
            <div class="stat-card">
                <div class="stat-number" id="validCount">-</div>
                <div class="stat-label">適切</div>
            </div>
            <div class="stat-card">
                <div class="stat-number" id="invalidCount">-</div>
                <div class="stat-label">不適切</div>
            </div>
            <div class="stat-card">
                <div class="stat-number" id="deletedCount">-</div>
                <div class="stat-label">削除済み</div>
            </div>
        </div>
        
        <div class="event-section">
            <div class="event-header" onclick="toggleEventSection()">
                <h2>イベント管理</h2>
                <span class="active-badge" id="activeEventBadge">読み込み中...</span>
                <span class="toggle-arrow" id="eventArrow">▼</span>
            </div>
            <div class="event-body" id="eventBody">
                <div class="event-create">
                    <input type="text" id="newEventName" class="form-input" style="width:180px" placeholder="イベント名（例: 七夕2025）">
                    <input type="text" id="newEventDescription" class="form-input" style="width:240px" placeholder="説明（任意）">
                    <button class="btn btn-primary" onclick="submitCreateEvent()">作成</button>
                </div>
                <table class="table">
                    <thead>
                        <tr>
                            <th>イベント名</th>
                            <th>説明</th>
                            <th>短冊数</th>
                            <th>状態</th>
                            <th>作成日時</th>
                            <th>操作</th>
                        </tr>
                    </thead>
                    <tbody id="eventTableBody">
                        <tr><td colspan="6" class="loading">読み込み中...</td></tr>
                    </tbody>
                </table>
            </div>
        </div>

        <div class="actions">
            <div class="search-box">
                <input type="text" class="search-input" id="searchInput" placeholder="内容またはユーザー名で検索..." onkeyup="performSearch()">
                <button class="search-clear" onclick="clearSearch()">✕</button>
                <span class="search-results" id="searchResults"></span>
            </div>
            <div>
                <button class="btn btn-primary" onclick="loadData()">データ更新</button>
                <button class="btn btn-primary" onclick="showCreateModal()">新規作成</button>
                <button class="btn btn-primary" onclick="exportCSV()">CSV出力</button>
                <button class="btn btn-warning" onclick="showAll()">全て表示</button>
                <button class="btn btn-warning" onclick="showValid()">適切のみ</button>
                <button class="btn btn-warning" onclick="showInvalid()">不適切のみ</button>
                <button class="btn btn-warning" onclick="showDeleted()">削除済みのみ</button>
                <select id="eventFilterSelect" class="form-select" style="width:auto;display:inline-block;margin-left:0.5rem" onchange="applyEventFilter()">
                    <option value="all">イベント: すべて</option>
                    <option value="null">レガシー（なし）</option>
                </select>
            </div>
        </div>
        
        <div class="tanzaku-list">
            <div class="bulk-actions" id="bulkActions">
                <label class="select-all">
                    <input type="checkbox" id="selectAll" onchange="toggleSelectAll()">
                    全選択
                </label>
                <button class="btn btn-danger" onclick="bulkDelete()">選択項目を削除</button>
                <button class="btn btn-primary" onclick="bulkMarkValid()">選択項目を適切にする</button>
                <button class="btn btn-warning" onclick="bulkMarkInvalid()">選択項目を不適切にする</button>
            </div>
            
            <table class="table">
                <thead>
                    <tr>
                        <th>選択</th>
                        <th class="sortable" onclick="sortBy('id')">ID <span class="sort-icon" id="sort-id"></span></th>
                        <th class="sortable" onclick="sortBy('content')">内容 <span class="sort-icon" id="sort-content"></span></th>
                        <th class="sortable" onclick="sortBy('userName')">ユーザー名 <span class="sort-icon" id="sort-userName"></span></th>
                        <th class="sortable" onclick="sortBy('validationResult')">バリデーション <span class="sort-icon" id="sort-validationResult"></span></th>
                        <th>表示状態</th>
                        <th class="sortable" onclick="sortBy('event')">イベント <span class="sort-icon" id="sort-event"></span></th>
                        <th class="sortable" onclick="sortBy('createdAt')">作成日時 <span class="sort-icon" id="sort-createdAt">▼</span></th>
                        <th>操作</th>
                    </tr>
                </thead>
                <tbody id="tanzakuTableBody">
                    <tr>
                        <td colspan="9" class="loading">データを読み込み中...</td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>

    <!-- 作成・編集モーダル -->
    <div id="editModal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h2 class="modal-title" id="modalTitle">短冊を編集</h2>
                <button class="close" onclick="closeModal()">&times;</button>
            </div>
            <form id="editForm">
                <div class="form-group">
                    <label class="form-label" for="editContent">内容 (14文字以内)</label>
                    <input type="text" id="editContent" class="form-input" maxlength="14" required>
                </div>
                <div class="form-group">
                    <label class="form-label" for="editUserName">ユーザー名</label>
                    <input type="text" id="editUserName" class="form-input" required>
                </div>
                <div class="form-group">
                    <label class="form-label" for="editValidation">バリデーション結果</label>
                    <select id="editValidation" class="form-select">
                        <option value="0">適切</option>
                        <option value="1">不適切</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label" for="editEvent">イベント</label>
                    <select id="editEvent" class="form-select">
                        <option value="">レガシー（なし）</option>
                    </select>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-secondary" onclick="closeModal()">キャンセル</button>
                    <button type="submit" class="btn btn-primary" id="submitBtn">保存</button>
                </div>
            </form>
        </div>
    </div>

    <script>
        let allTanzaku = [];
        let filteredTanzaku = [];
        let searchTerm = '';
        let currentEditId = null;
        let sortColumn = 'createdAt';
        let sortDirection = 'desc';
        let activeEventFilter = 'all';
        
        async function loadData() {
            try {
                showMessage('データを読み込み中...', 'info');
                const response = await fetch('/manage/tanzakus');
                if (!response.ok) throw new Error('データの取得に失敗しました');
                
                allTanzaku = await response.json();
                filteredTanzaku = applyBaseFilter(allTanzaku);
                applySearch();
                updateStats();
                renderTable();
                updateSearchResults();
                showMessage('データを更新しました', 'success');
            } catch (error) {
                showMessage(\`エラー: \${error.message}\`, 'error');
            }
        }
        
        function updateStats() {
            const total = allTanzaku.length;
            const valid = allTanzaku.filter(t => t.validationResult === 0 && !t.logicalDelete).length;
            const invalid = allTanzaku.filter(t => t.validationResult === 1 && !t.logicalDelete).length;
            const deleted = allTanzaku.filter(t => t.logicalDelete).length;
            
            document.getElementById('totalCount').textContent = total;
            document.getElementById('validCount').textContent = valid;
            document.getElementById('invalidCount').textContent = invalid;
            document.getElementById('deletedCount').textContent = deleted;
        }
        
        function renderTable() {
            const tbody = document.getElementById('tanzakuTableBody');

            if (filteredTanzaku.length === 0) {
                tbody.innerHTML = '<tr><td colspan="9" class="loading">データがありません</td></tr>';
                return;
            }

            const sorted = sortTanzaku(filteredTanzaku);
            updateSortIcons();

            tbody.innerHTML = sorted.map(function(tanzaku) {
                var eventName = tanzaku.event ? escapeHtml(tanzaku.event.name) : '<span style="color:#aaa">-</span>';
                var eventId = tanzaku.event ? tanzaku.event.id : '';
                return '<tr>' +
                    '<td><input type="checkbox" class="checkbox tanzaku-checkbox" value="' + tanzaku.id + '" onchange="updateBulkActions()"></td>' +
                    '<td>' + tanzaku.id.substring(0, 8) + '...</td>' +
                    '<td>' + escapeHtml(tanzaku.content) + '</td>' +
                    '<td>' + escapeHtml(tanzaku.userName) + '</td>' +
                    '<td><span class="validation-badge ' + (tanzaku.validationResult === 0 ? 'validation-ok' : 'validation-ng') + '">' + (tanzaku.validationResult === 0 ? '適切' : '不適切') + '</span></td>' +
                    '<td><span class="status-badge ' + getStatusClass(tanzaku) + '">' + getStatusText(tanzaku) + '</span></td>' +
                    '<td>' + eventName + '</td>' +
                    '<td>' + new Date(tanzaku.createdAt).toLocaleString('ja-JP') + '</td>' +
                    '<td>' +
                        '<button class="btn btn-primary" onclick="showEditModal(\\'' + tanzaku.id + '\\', \\'' + escapeHtml(tanzaku.content) + '\\', \\'' + escapeHtml(tanzaku.userName) + '\\', ' + tanzaku.validationResult + ', \\'' + eventId + '\\')">編集</button>' +
                        (!tanzaku.logicalDelete ? '<button class="btn btn-danger" onclick="deleteTanzaku(\\'' + tanzaku.id + '\\')">削除</button>' : '') +
                        '<button class="btn btn-primary" onclick="toggleValidation(\\'' + tanzaku.id + '\\', ' + (tanzaku.validationResult === 0 ? 1 : 0) + ')">' + (tanzaku.validationResult === 0 ? '不適切にする' : '適切にする') + '</button>' +
                    '</td>' +
                '</tr>';
            }).join('');
        }

        function sortTanzaku(list) {
            return list.slice().sort(function(a, b) {
                var aVal, bVal;
                if (sortColumn === 'event') {
                    aVal = a.event ? a.event.name : '';
                    bVal = b.event ? b.event.name : '';
                } else {
                    aVal = a[sortColumn] ?? '';
                    bVal = b[sortColumn] ?? '';
                }
                if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
                if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
                return 0;
            });
        }

        function sortBy(col) {
            if (sortColumn === col) {
                sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                sortColumn = col;
                sortDirection = 'asc';
            }
            renderTable();
        }

        function updateSortIcons() {
            var cols = ['id', 'content', 'userName', 'validationResult', 'event', 'createdAt'];
            cols.forEach(function(col) {
                var el = document.getElementById('sort-' + col);
                if (!el) return;
                if (col === sortColumn) {
                    el.textContent = sortDirection === 'asc' ? '▲' : '▼';
                } else {
                    el.textContent = '';
                }
            });
        }
        
        function getStatusClass(tanzaku) {
            if (tanzaku.logicalDelete) return 'status-deleted';
            return tanzaku.visiblePattern ? 'status-visible' : 'status-hidden';
        }
        
        function getStatusText(tanzaku) {
            if (tanzaku.logicalDelete) return '削除済み';
            return tanzaku.visiblePattern ? '表示中' : '非表示';
        }
        
        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
        
        async function deleteTanzaku(id) {
            if (!confirm('この短冊を削除しますか？')) return;
            
            try {
                const response = await fetch('/manage/tanzakus', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify([{ id, operation: 'delete' }])
                });
                
                if (!response.ok) throw new Error('削除に失敗しました');
                
                showMessage('削除しました', 'success');
                loadData();
            } catch (error) {
                showMessage(\`エラー: \${error.message}\`, 'error');
            }
        }
        
        async function toggleValidation(id, newValidationResult) {
            try {
                const response = await fetch('/manage/tanzakus', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify([{ id, operation: 'update', validationResult: newValidationResult }])
                });
                
                if (!response.ok) throw new Error('更新に失敗しました');
                
                showMessage('バリデーション結果を更新しました', 'success');
                loadData();
            } catch (error) {
                showMessage(\`エラー: \${error.message}\`, 'error');
            }
        }
        
        function applyBaseFilter(base) {
            var ef = activeEventFilter;
            return base.filter(function(t) {
                if (ef === 'null') return t.eventId === null || t.eventId === undefined;
                if (ef !== 'all') return t.eventId === ef;
                return true;
            });
        }

        function showAll() {
            filteredTanzaku = applyBaseFilter(allTanzaku);
            applySearch();
            renderTable();
        }

        function showValid() {
            filteredTanzaku = applyBaseFilter(allTanzaku.filter(function(t) { return t.validationResult === 0 && !t.logicalDelete; }));
            applySearch();
            renderTable();
        }

        function showInvalid() {
            filteredTanzaku = applyBaseFilter(allTanzaku.filter(function(t) { return t.validationResult === 1 && !t.logicalDelete; }));
            applySearch();
            renderTable();
        }

        function showDeleted() {
            filteredTanzaku = applyBaseFilter(allTanzaku.filter(function(t) { return t.logicalDelete; }));
            applySearch();
            renderTable();
        }

        function applyEventFilter() {
            activeEventFilter = document.getElementById('eventFilterSelect').value;
            showAll();
        }
        
        function performSearch() {
            searchTerm = document.getElementById('searchInput').value.toLowerCase();
            applySearch();
            renderTable();
            updateSearchResults();
        }
        
        function applySearch() {
            if (!searchTerm) return;
            
            filteredTanzaku = filteredTanzaku.filter(tanzaku => 
                tanzaku.content.toLowerCase().includes(searchTerm) ||
                tanzaku.userName.toLowerCase().includes(searchTerm)
            );
        }
        
        function clearSearch() {
            document.getElementById('searchInput').value = '';
            searchTerm = '';
            showAll();
            updateSearchResults();
        }
        
        function updateSearchResults() {
            const resultsSpan = document.getElementById('searchResults');
            if (searchTerm) {
                resultsSpan.textContent = \`\${filteredTanzaku.length}件の結果\`;
            } else {
                resultsSpan.textContent = '';
            }
        }
        
        function updateBulkActions() {
            const checkboxes = document.querySelectorAll('.tanzaku-checkbox:checked');
            const bulkActions = document.getElementById('bulkActions');
            
            if (checkboxes.length > 0) {
                bulkActions.classList.add('show');
            } else {
                bulkActions.classList.remove('show');
            }
        }
        
        function toggleSelectAll() {
            const selectAll = document.getElementById('selectAll');
            const checkboxes = document.querySelectorAll('.tanzaku-checkbox');
            
            checkboxes.forEach(cb => cb.checked = selectAll.checked);
            updateBulkActions();
        }
        
        async function bulkDelete() {
            const selected = Array.from(document.querySelectorAll('.tanzaku-checkbox:checked')).map(cb => cb.value);
            if (selected.length === 0) return;
            
            if (!confirm(\`\${selected.length}件の短冊を削除しますか？\`)) return;
            
            try {
                const response = await fetch('/manage/tanzakus', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(selected.map(id => ({ id, operation: 'delete' })))
                });
                
                if (!response.ok) throw new Error('一括削除に失敗しました');
                
                showMessage(\`\${selected.length}件を削除しました\`, 'success');
                document.getElementById('selectAll').checked = false;
                updateBulkActions();
                loadData();
            } catch (error) {
                showMessage(\`エラー: \${error.message}\`, 'error');
            }
        }
        
        async function bulkMarkValid() {
            const selected = Array.from(document.querySelectorAll('.tanzaku-checkbox:checked')).map(cb => cb.value);
            if (selected.length === 0) return;
            
            try {
                const response = await fetch('/manage/tanzakus', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(selected.map(id => ({ id, operation: 'update', validationResult: 0 })))
                });
                
                if (!response.ok) throw new Error('一括更新に失敗しました');
                
                showMessage(\`\${selected.length}件を適切に設定しました\`, 'success');
                document.getElementById('selectAll').checked = false;
                updateBulkActions();
                loadData();
            } catch (error) {
                showMessage(\`エラー: \${error.message}\`, 'error');
            }
        }
        
        async function bulkMarkInvalid() {
            const selected = Array.from(document.querySelectorAll('.tanzaku-checkbox:checked')).map(cb => cb.value);
            if (selected.length === 0) return;
            
            try {
                const response = await fetch('/manage/tanzakus', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(selected.map(id => ({ id, operation: 'update', validationResult: 1 })))
                });
                
                if (!response.ok) throw new Error('一括更新に失敗しました');
                
                showMessage(\`\${selected.length}件を不適切に設定しました\`, 'success');
                document.getElementById('selectAll').checked = false;
                updateBulkActions();
                loadData();
            } catch (error) {
                showMessage(\`エラー: \${error.message}\`, 'error');
            }
        }
        
        function showMessage(text, type) {
            const messageDiv = document.getElementById('message');
            messageDiv.className = type;
            messageDiv.textContent = text;
            
            setTimeout(() => {
                messageDiv.textContent = '';
                messageDiv.className = '';
            }, 3000);
        }
        
        function populateEventSelect(selectedId) {
            var sel = document.getElementById('editEvent');
            sel.innerHTML = '<option value="">レガシー（なし）</option>';
            allEvents.forEach(function(ev) {
                var opt = document.createElement('option');
                opt.value = ev.id;
                opt.textContent = ev.name + (ev.isActive ? ' ★' : '');
                if (ev.id === selectedId) opt.selected = true;
                sel.appendChild(opt);
            });
        }

        function showCreateModal() {
            currentEditId = null;
            document.getElementById('modalTitle').textContent = '新規短冊作成';
            document.getElementById('submitBtn').textContent = '作成';
            document.getElementById('editContent').value = '';
            document.getElementById('editUserName').value = '';
            document.getElementById('editValidation').value = '0';
            populateEventSelect('');
            document.getElementById('editModal').style.display = 'block';
        }

        function showEditModal(id, content, userName, validationResult, eventId) {
            currentEditId = id;
            document.getElementById('modalTitle').textContent = '短冊を編集';
            document.getElementById('submitBtn').textContent = '更新';
            document.getElementById('editContent').value = content;
            document.getElementById('editUserName').value = userName;
            document.getElementById('editValidation').value = validationResult.toString();
            populateEventSelect(eventId || '');
            document.getElementById('editModal').style.display = 'block';
        }
        
        function closeModal() {
            document.getElementById('editModal').style.display = 'none';
            currentEditId = null;
        }
        
        // モーダル外クリックで閉じる
        window.onclick = function(event) {
            const modal = document.getElementById('editModal');
            if (event.target === modal) {
                closeModal();
            }
        }
        
        // フォーム送信処理
        document.getElementById('editForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const content = document.getElementById('editContent').value.trim();
            const userName = document.getElementById('editUserName').value.trim();
            const validationResult = parseInt(document.getElementById('editValidation').value);
            const eventIdVal = document.getElementById('editEvent').value || null;

            if (!content || !userName) {
                showMessage('内容とユーザー名は必須です', 'error');
                return;
            }

            if (content.length > 14) {
                showMessage('内容は14文字以内で入力してください', 'error');
                return;
            }

            try {
                if (currentEditId) {
                    // 編集
                    const response = await fetch('/manage/tanzakus', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify([{
                            id: currentEditId,
                            operation: 'update',
                            content,
                            userName,
                            validationResult,
                            eventId: eventIdVal
                        }])
                    });

                    if (!response.ok) throw new Error('更新に失敗しました');
                    showMessage('短冊を更新しました', 'success');
                } else {
                    // 新規作成
                    const response = await fetch('/manage/tanzakus/create', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            content,
                            userName,
                            validationResult,
                            eventId: eventIdVal
                        })
                    });

                    if (!response.ok) throw new Error('作成に失敗しました');
                    showMessage('新しい短冊を作成しました', 'success');
                }
                
                closeModal();
                loadData();
            } catch (error) {
                showMessage(\`エラー: \${error.message}\`, 'error');
            }
        });
        
        function exportCSV() {
            if (filteredTanzaku.length === 0) {
                showMessage('出力するデータがありません', 'error');
                return;
            }
            
            // CSVヘッダー
            const headers = ['ID', '内容', 'ユーザー名', 'バリデーション結果', '表示パターン', '論理削除', '作成日時'];
            
            // CSVデータ作成
            const csvData = [
                headers.join(','),
                ...filteredTanzaku.map(tanzaku => [
                    tanzaku.id,
                    \`"\${tanzaku.content.replace(/"/g, '""')}"\`, // ダブルクォートをエスケープ
                    \`"\${tanzaku.userName.replace(/"/g, '""')}"\`,
                    tanzaku.validationResult === 0 ? '適切' : '不適切',
                    tanzaku.visiblePattern ? '表示' : '非表示',
                    tanzaku.logicalDelete ? '削除済み' : '有効',
                    new Date(tanzaku.createdAt).toLocaleString('ja-JP')
                ].join(','))
            ].join('\\n');
            
            // BOMを追加してExcelで文字化けを防ぐ
            const bom = '\\uFEFF';
            const blob = new Blob([bom + csvData], { type: 'text/csv;charset=utf-8;' });
            
            // ダウンロード
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            
            // ファイル名に現在の日時を含める
            const now = new Date();
            const dateString = now.getFullYear() + 
                String(now.getMonth() + 1).padStart(2, '0') + 
                String(now.getDate()).padStart(2, '0') + '_' +
                String(now.getHours()).padStart(2, '0') + 
                String(now.getMinutes()).padStart(2, '0');
            
            link.setAttribute('download', \`tanzaku_data_\${dateString}.csv\`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            showMessage(\`\${filteredTanzaku.length}件のデータをCSVで出力しました\`, 'success');
        }
        
        // イベント管理
        let allEvents = [];

        async function loadEvents() {
            try {
                const response = await fetch('/manage/events');
                if (!response.ok) throw new Error('イベントの取得に失敗しました');
                allEvents = await response.json();
                renderEvents();
                updateEventFilterOptions();
            } catch (error) {
                showMessage('イベント取得エラー: ' + error.message, 'error');
            }
        }

        function updateEventFilterOptions() {
            var sel = document.getElementById('eventFilterSelect');
            var current = sel.value;
            sel.innerHTML = '<option value="all">イベント: すべて</option><option value="null">レガシー（なし）</option>';
            allEvents.forEach(function(ev) {
                var opt = document.createElement('option');
                opt.value = ev.id;
                opt.textContent = ev.name + (ev.isActive ? ' ★' : '');
                sel.appendChild(opt);
            });
            sel.value = current;
        }

        function renderEvents() {
            const activeEvent = allEvents.find(function(e) { return e.isActive; });
            document.getElementById('activeEventBadge').textContent =
                'アクティブ: ' + (activeEvent ? activeEvent.name : 'なし（レガシーデータ表示中）');

            const tbody = document.getElementById('eventTableBody');
            if (allEvents.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="loading">イベントがありません</td></tr>';
                return;
            }
            tbody.innerHTML = allEvents.map(function(event) {
                var statusCell = event.isActive
                    ? '<span class="status-badge status-visible">アクティブ</span>'
                    : '';
                var actionBtn = event.isActive
                    ? '<button class="btn btn-warning" onclick="deactivateAllEvents()">無効にする</button>'
                    : '<button class="btn btn-primary" data-event-id="' + escapeHtml(event.id) + '" onclick="activateEvent(this.getAttribute(\\'data-event-id\\'))">アクティブにする</button>';
                return '<tr>' +
                    '<td>' + escapeHtml(event.name) + '</td>' +
                    '<td>' + (event.description ? escapeHtml(event.description) : '-') + '</td>' +
                    '<td>' + event._count.tanzakus + '件</td>' +
                    '<td>' + statusCell + '</td>' +
                    '<td>' + new Date(event.createdAt).toLocaleString('ja-JP') + '</td>' +
                    '<td>' + actionBtn + '</td>' +
                    '</tr>';
            }).join('');
        }

        function toggleEventSection() {
            const body = document.getElementById('eventBody');
            const arrow = document.getElementById('eventArrow');
            if (body.style.display === 'none' || body.style.display === '') {
                body.style.display = 'block';
                arrow.textContent = '▲';
            } else {
                body.style.display = 'none';
                arrow.textContent = '▼';
            }
        }

        async function submitCreateEvent() {
            const name = document.getElementById('newEventName').value.trim();
            const description = document.getElementById('newEventDescription').value.trim();
            if (!name) { showMessage('イベント名は必須です', 'error'); return; }

            try {
                const body = { name: name };
                if (description) body.description = description;
                const response = await fetch('/manage/events', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                if (!response.ok) throw new Error('作成に失敗しました');
                document.getElementById('newEventName').value = '';
                document.getElementById('newEventDescription').value = '';
                showMessage('イベントを作成しました', 'success');
                loadEvents();
            } catch (error) {
                showMessage('エラー: ' + error.message, 'error');
            }
        }

        async function activateEvent(id) {
            try {
                const response = await fetch('/manage/events/' + id + '/activate', { method: 'POST' });
                if (!response.ok) throw new Error('切り替えに失敗しました');
                showMessage('イベントを切り替えました', 'success');
                loadEvents();
                loadData();
            } catch (error) {
                showMessage('エラー: ' + error.message, 'error');
            }
        }

        async function deactivateAllEvents() {
            try {
                const response = await fetch('/manage/events/deactivate-all', { method: 'POST' });
                if (!response.ok) throw new Error('無効化に失敗しました');
                showMessage('イベントを無効にしました', 'success');
                loadEvents();
                loadData();
            } catch (error) {
                showMessage('エラー: ' + error.message, 'error');
            }
        }

        // ページ読み込み時にデータを取得
        window.addEventListener('load', function() { loadData(); loadEvents(); });
    </script>
</body>
</html>`;

manage.get("/", (c) => {
  return c.html(adminHtml);
});

manage.get("/tanzakus", async (c) => {
  const service = new TanzakuService(c.env.DB);
  try {
    const result = await service.getAllTanzaku();
    return c.json(result);
  } catch (error) {
    console.error("Failed to get tanzakus:", error);
    return c.json({ error: "Failed to get tanzakus" }, 500);
  }
});

manage.post("/tanzakus/create", async (c) => {
  const service = new TanzakuService(c.env.DB);
  try {
    const data = (await c.req.json()) as {
      content: string;
      userName: string;
      validationResult?: number;
      eventId?: string | null;
    };

    // バリデーション結果が指定されていない場合は0（適切）にする
    const validationResult = data.validationResult ?? 0;

    const result = await service.createTanzaku(
      { content: data.content, userName: data.userName },
      null // AI validation is skipped in manage mode
    );

    // 管理画面で作成する場合は指定されたバリデーション結果・イベントを使用
    if (data.validationResult !== undefined || data.eventId !== undefined) {
      await service.editTanzaku([
        {
          id: result.id,
          operation: "update",
          validationResult: validationResult,
          eventId: data.eventId
        }
      ]);
    }

    return c.json({ success: true, id: result.id });
  } catch (error) {
    console.error("Failed to create tanzaku:", error);
    return c.json({ error: "Failed to create tanzaku" }, 500);
  }
});

manage.post("/tanzakus", async (c) => {
  const service = new TanzakuService(c.env.DB);
  try {
    const requestData = (await c.req.json()) as Array<
      | {
          id: string;
          operation: "delete";
        }
      | {
          id: string;
          operation: "update";
          content?: string;
          userName?: string;
          validationResult?: number;
        }
    >;

    await service.editTanzaku(requestData);
    return c.json({ success: true });
  } catch (error) {
    console.error("Failed to edit tanzakus:", error);
    return c.json({ error: "Failed to edit tanzakus" }, 500);
  }
});

manage.get("/events", async (c) => {
  const service = new EventService(c.env.DB);
  try {
    const events = await service.getAllEvents();
    return c.json(events);
  } catch (error) {
    console.error("Failed to get events:", error);
    return c.json({ error: "Failed to get events" }, 500);
  }
});

manage.post("/events", async (c) => {
  const service = new EventService(c.env.DB);
  try {
    const data = await c.req.json<{ id?: string; name: string; description?: string }>();
    const event = await service.createEvent(data);
    return c.json({ success: true, id: event.id });
  } catch (error) {
    console.error("Failed to create event:", error);
    return c.json({ error: "Failed to create event" }, 500);
  }
});

// 静的ルートを :id より先に登録
manage.post("/events/deactivate-all", async (c) => {
  const service = new EventService(c.env.DB);
  try {
    await service.deactivateAll();
    return c.json({ success: true });
  } catch (error) {
    console.error("Failed to deactivate events:", error);
    return c.json({ error: "Failed to deactivate events" }, 500);
  }
});

manage.post("/events/:id/activate", async (c) => {
  const service = new EventService(c.env.DB);
  try {
    const { id } = c.req.param();
    await service.activateEvent(id);
    return c.json({ success: true });
  } catch (error) {
    console.error("Failed to activate event:", error);
    return c.json({ error: "Failed to activate event" }, 500);
  }
});

export default manage;
