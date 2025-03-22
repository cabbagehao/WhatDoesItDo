// 存储已经解释过的域名
let explainedDomains = new Set();

// 日志函数
function log(message, data = null) {
    const timestamp = new Date().toISOString();
    if (data) {
        console.log(`[Domain Explainer Content ${timestamp}]`, message, data);
    } else {
        console.log(`[Domain Explainer Content ${timestamp}]`, message);
    }
}

// 监听来自popup的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'EXPLAIN_DOMAINS') {
        log('收到popup触发请求');
        processDomains();
        sendResponse({status: 'processing'});
    }
});

// 监听页面滚动
let scrollTimeout;
window.addEventListener('scroll', () => {
    log('页面滚动事件触发');
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(processDomains, 1000); // 改为1秒间隔
});

// 处理域名的主函数
async function processDomains() {
    try {
        log('开始处理域名');
        
        // 获取所有域名元素
        const domainElements = document.querySelectorAll('a[href*="/website/"][href*="/overview/"]');
        log('找到域名元素数量', domainElements.length);
        
        const newDomains = [];
        
        // 收集未解释过的域名
        domainElements.forEach(element => {
            const domain = element.textContent.trim();
            if (!explainedDomains.has(domain)) {
                newDomains.push(domain);
                explainedDomains.add(domain);
            }
        });
        
        log('新发现的域名数量', newDomains.length);
        if (newDomains.length > 0) {
            log('待处理的域名列表', newDomains);
        }
        
        if (newDomains.length === 0) {
            log('没有新的域名需要处理');
            return;
        }
        
        // 调用后端API获取域名解释
        log('开始调用后端API');
        const response = await fetch('http://localhost:5000/explain-domains', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ domains: newDomains })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const explanations = await response.json();
        log('收到后端响应', explanations);
        
        // 为每个域名添加解释
        log('开始在页面上添加解释');
        let addedCount = 0;
        
        domainElements.forEach(element => {
            const domain = element.textContent.trim();
            if (explanations[domain]) {
                const explanation = explanations[domain];
                
                // 检查是否已经添加了解释
                const existingExplanation = element.nextElementSibling?.classList.contains('domain-explanation');
                if (!existingExplanation) {
                    const explanationDiv = document.createElement('div');
                    explanationDiv.className = 'domain-explanation';
                    explanationDiv.style.color = '#666';
                    explanationDiv.style.fontSize = '12px';
                    explanationDiv.style.marginTop = '4px';
                    explanationDiv.textContent = explanation;
                    
                    // 将解释插入到域名链接后面
                    element.parentNode.insertBefore(explanationDiv, element.nextSibling);
                    addedCount++;
                }
            }
        });
        
        log(`成功添加${addedCount}个域名解释`);
        
        // 更新插件状态
        chrome.runtime.sendMessage({type: 'STATUS', active: true})
            .then(response => {
                log('状态更新成功', response);
            })
            .catch(error => {
                log('状态更新失败', error);
            });
        
    } catch (error) {
        log('处理域名时出错', error);
        // 通知background script出错状态
        chrome.runtime.sendMessage({type: 'STATUS', active: false})
            .then(response => {
                log('已通知background错误状态', response);
            })
            .catch(error => {
                log('通知background错误状态失败', error);
            });
    }
} 