import { Hono } from "hono";
import { TanzakuService } from "../services/tanzaku.service";
import { basicAuth } from "hono/basic-auth";

const manage = new Hono<{ Bindings: CloudflareBindings }>();

// Basic認証ミドルウェア
manage.use("*", (c, next) => {
  const auth = basicAuth({
    username: c.env.ADMIN_ID || "admin",
    password: c.env.ADMIN_PWD || "password",
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
                        <th>ID</th>
                        <th>内容</th>
                        <th>ユーザー名</th>
                        <th>バリデーション</th>
                        <th>表示状態</th>
                        <th>作成日時</th>
                        <th>操作</th>
                    </tr>
                </thead>
                <tbody id="tanzakuTableBody">
                    <tr>
                        <td colspan="8" class="loading">データを読み込み中...</td>
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
        
        async function loadData() {
            try {
                showMessage('データを読み込み中...', 'info');
                const response = await fetch('/manage/tanzakus');
                if (!response.ok) throw new Error('データの取得に失敗しました');
                
                allTanzaku = await response.json();
                filteredTanzaku = [...allTanzaku];
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
                tbody.innerHTML = '<tr><td colspan="8" class="loading">データがありません</td></tr>';
                return;
            }
            
            tbody.innerHTML = filteredTanzaku.map(tanzaku => \`
                <tr>
                    <td><input type="checkbox" class="checkbox tanzaku-checkbox" value="\${tanzaku.id}" onchange="updateBulkActions()"></td>
                    <td>\${tanzaku.id.substring(0, 8)}...</td>
                    <td>\${escapeHtml(tanzaku.content)}</td>
                    <td>\${escapeHtml(tanzaku.userName)}</td>
                    <td><span class="validation-badge \${tanzaku.validationResult === 0 ? 'validation-ok' : 'validation-ng'}">\${tanzaku.validationResult === 0 ? '適切' : '不適切'}</span></td>
                    <td><span class="status-badge \${getStatusClass(tanzaku)}">\${getStatusText(tanzaku)}</span></td>
                    <td>\${new Date(tanzaku.createdAt).toLocaleString('ja-JP')}</td>
                    <td>
                        <button class="btn btn-primary" onclick="showEditModal('\${tanzaku.id}', '\${escapeHtml(tanzaku.content)}', '\${escapeHtml(tanzaku.userName)}', \${tanzaku.validationResult})">編集</button>
                        \${!tanzaku.logicalDelete ? \`<button class="btn btn-danger" onclick="deleteTanzaku('\${tanzaku.id}')">削除</button>\` : ''}
                        <button class="btn btn-primary" onclick="toggleValidation('\${tanzaku.id}', \${tanzaku.validationResult === 0 ? 1 : 0})">\${tanzaku.validationResult === 0 ? '不適切にする' : '適切にする'}</button>
                    </td>
                </tr>
            \`).join('');
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
        
        function showAll() {
            filteredTanzaku = [...allTanzaku];
            applySearch();
            renderTable();
        }
        
        function showValid() {
            filteredTanzaku = allTanzaku.filter(t => t.validationResult === 0 && !t.logicalDelete);
            applySearch();
            renderTable();
        }
        
        function showInvalid() {
            filteredTanzaku = allTanzaku.filter(t => t.validationResult === 1 && !t.logicalDelete);
            applySearch();
            renderTable();
        }
        
        function showDeleted() {
            filteredTanzaku = allTanzaku.filter(t => t.logicalDelete);
            applySearch();
            renderTable();
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
        
        function showCreateModal() {
            currentEditId = null;
            document.getElementById('modalTitle').textContent = '新規短冊作成';
            document.getElementById('submitBtn').textContent = '作成';
            document.getElementById('editContent').value = '';
            document.getElementById('editUserName').value = '';
            document.getElementById('editValidation').value = '0';
            document.getElementById('editModal').style.display = 'block';
        }
        
        function showEditModal(id, content, userName, validationResult) {
            currentEditId = id;
            document.getElementById('modalTitle').textContent = '短冊を編集';
            document.getElementById('submitBtn').textContent = '更新';
            document.getElementById('editContent').value = content;
            document.getElementById('editUserName').value = userName;
            document.getElementById('editValidation').value = validationResult.toString();
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
                            validationResult
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
                            validationResult
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
        
        // ページ読み込み時にデータを取得
        window.addEventListener('load', loadData);
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
    };
    
    // バリデーション結果が指定されていない場合は0（適切）にする
    const validationResult = data.validationResult ?? 0;
    
    const result = await service.createTanzaku(
      { content: data.content, userName: data.userName },
      null // AI validation is skipped in manage mode
    );
    
    // 管理画面で作成する場合は指定されたバリデーション結果を使用
    if (data.validationResult !== undefined) {
      await service.editTanzaku([{
        id: result.id,
        operation: "update",
        validationResult: validationResult
      }]);
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

export default manage;
