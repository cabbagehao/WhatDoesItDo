// 全局变量
let isFeatureEnabled = true;
let processedDomains = new Set();

// 日志函数
function log(message, data = null) {
    const timestamp = new Date().toISOString();
    if (data) {
        console.log(`[Domain Explainer Content ${timestamp}]`, message, data);
    } else {
        console.log(`[Domain Explainer Content ${timestamp}]`, message);
    }
}

// 清除所有域名解释
function clearDomainExplanations() {
    log('清除所有域名解释');
    const explanations = document.querySelectorAll('.domain-explanation');
    explanations.forEach(el => el.remove());
    processedDomains.clear();
}

// 处理域名
async function processDomains() {
    if (!isFeatureEnabled) {
        log('功能已关闭，跳过处理');
        return;
    }

    const domains = [];
    const rows = document.querySelectorAll('tbody tr');
    
    rows.forEach(row => {
        const domainCell = row.querySelector('td:nth-child(2)');
        if (domainCell && domainCell.textContent) {
            const domain = domainCell.textContent.trim();
            if (!processedDomains.has(domain)) {
                domains.push(domain);
                processedDomains.add(domain);
            }
        }
    });

    if (domains.length > 0) {
        log(`发现新域名：${domains.length}个`, domains);
        
        try {
            const response = await fetch('http://localhost:5000/explain', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ domains })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            
            // 添加解释到页面
            rows.forEach(row => {
                const domainCell = row.querySelector('td:nth-child(2)');
                if (domainCell) {
                    const domain = domainCell.textContent.trim();
                    const explanation = data[domain];
                    
                    if (explanation && !row.querySelector('.domain-explanation')) {
                        const explanationDiv = document.createElement('div');
                        explanationDiv.className = 'domain-explanation';
                        explanationDiv.style.color = '#666';
                        explanationDiv.style.fontSize = '0.9em';
                        explanationDiv.style.marginTop = '5px';
                        explanationDiv.textContent = explanation;
                        domainCell.appendChild(explanationDiv);
                    }
                }
            });

            // 更新插件状态
            chrome.runtime.sendMessage({
                type: 'STATUS',
                active: true
            });

        } catch (error) {
            log('处理域名时出错', error);
            chrome.runtime.sendMessage({
                type: 'STATUS',
                active: false
            });
        }
    }
}

// 初始化功能
async function initializeFeature() {
    // 从storage获取开关状态
    const result = await chrome.storage.local.get('featureEnabled');
    isFeatureEnabled = result.featureEnabled !== false; // 默认为true
    
    if (isFeatureEnabled) {
        // 页面加载完成后自动处理一次
        processDomains();
    }
}

// 监听消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    log('收到消息', request);
    
    if (request.action === 'EXPLAIN_DOMAINS') {
        processDomains().then(() => {
            sendResponse({status: 'processing'});
        }).catch(error => {
            log('处理域名时出错', error);
            sendResponse({status: 'error', message: error.message});
        });
        return true;
    } else if (request.action === 'ENABLE_FEATURE') {
        isFeatureEnabled = true;
        processDomains(); // 重新处理所有域名
        sendResponse({status: 'enabled'});
    } else if (request.action === 'DISABLE_FEATURE') {
        isFeatureEnabled = false;
        clearDomainExplanations();
        sendResponse({status: 'disabled'});
    }
});

// 监听DOM变化
const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            const hasNewRows = Array.from(mutation.addedNodes).some(node => 
                node.nodeName === 'TR' || node.querySelector?.('tr')
            );
            
            if (hasNewRows) {
                log('检测到新的表格行');
                processDomains();
                break;
            }
        }
    }
});

// 启动观察器
const tbody = document.querySelector('tbody');
if (tbody) {
    observer.observe(tbody, { childList: true, subtree: true });
    log('DOM观察器已启动');
}

// 初始化
initializeFeature();

// 监听滚动事件
let scrollTimeout;
window.addEventListener('scroll', () => {
    if (!isFeatureEnabled) return;
    
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
        processDomains();
    }, 1000);
}); 