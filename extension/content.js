// 全局变量
let isFeatureEnabled = true;
let processedDomains = new Set();
let pendingDomains = new Set();  // 新增：跟踪正在处理中的域名
let pollingInterval = null;      // 新增：轮询定时器

// 添加样式到页面
const style = document.createElement('style');
style.textContent = `
    .domain-explanation-row td {
        padding: 4px 0 !important;
        font-size: 12px !important;
        color: #666 !important;
        border-top: none !important;
    }
    .domain-explanation-row td > div {
        padding-left: var(--domain-padding-left);
        padding-right: 16px;
        line-height: 1.3;
    }
    .domain-info-icon {
        cursor: pointer !important;
        margin-left: 8px;
        opacity: 0.6;
        transition: opacity 0.2s;
        vertical-align: middle;
        display: inline-block;
        position: relative;
        z-index: 2;
    }
    .domain-info-icon:hover {
        opacity: 1;
    }
    .domain-tooltip {
        position: fixed;
        background: white;
        border: 1px solid #ddd;
        border-radius: 4px;
        padding: 8px 12px;
        font-size: 12px;
        color: #666;
        max-width: 300px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        z-index: 999999;
        line-height: 1.4;
        pointer-events: none;
    }
`;
document.head.appendChild(style);

// 日志函数
function log(message, data = null) {
    const timestamp = new Date().toISOString();
    if (data) {
        console.log(`[Domain Explainer Content ${timestamp}]`, message, data);
    } else {
        console.log(`[Domain Explainer Content ${timestamp}]`, message);
    }
}

// 获取域名链接元素
function getDomainLink(cell) {
    // 1. 尝试通过 href 属性查找
    const link = cell.querySelector('a[href*="/website/"][href*="/overview/"]');
    if (link) return link;
    
    // 2. 尝试通过数据属性查找
    const dataLink = cell.querySelector('a[data-ui-name="Tooltip.Trigger"]');
    if (dataLink) return dataLink;
    
    // 3. 查找单元格中的任何链接
    const anyLink = cell.querySelector('a');
    if (anyLink && anyLink.href && anyLink.href.includes('semrush.com/website/')) {
        return anyLink;
    }
    
    return null;
}

// 获取最后一列单元格
function getLastCell(row) {
    // 1. 尝试获取最后一个单元格
    const cells = row.querySelectorAll('td');
    if (cells.length > 0) {
        return cells[cells.length - 1];
    }
    return null;
}

// 清除所有域名解释
function clearDomainExplanations() {
    log('清除所有域名解释');
    const icons = document.querySelectorAll('.domain-info-icon');
    icons.forEach(el => el.remove());
    processedDomains.clear();
}

// 处理域名
async function processDomains() {
    if (!isFeatureEnabled) {
        log('功能已关闭，跳过处理');
        return;
    }

    const domains = [];
    const rows = document.querySelectorAll('tbody tr:not(.domain-explanation-row)');
    
    rows.forEach(row => {
        const domainCell = row.querySelector('td:nth-child(2)');
        if (domainCell) {
            const domainLink = getDomainLink(domainCell);
            if (domainLink) {
                const domain = domainLink.textContent.trim();
                // 只处理未处理且不在待处理列表中的域名
                if (!processedDomains.has(domain) && !pendingDomains.has(domain)) {
                    domains.push(domain);
                    pendingDomains.add(domain);  // 添加到待处理列表
                }
            }
        }
    });

    if (domains.length > 0) {
        log('发现新域名：', domains);
        
        try {
            // 发送请求并处理流式响应
            const response = await fetch('http://localhost:5001/explain-domains', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ domains })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            // 创建响应流读取器
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let processedCount = 0;  // 记录已处理的域名数量

            while (true) {
                const { done, value } = await reader.read();
                
                if (done) {
                    // 处理缓冲区中剩余的数据
                    if (buffer.trim()) {
                        try {
                            const result = JSON.parse(buffer.trim());
                            processStreamResult(result, rows);
                            processedCount++;
                        } catch (e) {
                            console.error('解析最后的JSON时出错:', e);
                        }
                    }
                    break;
                }
                
                // 将新数据添加到缓冲区
                buffer += decoder.decode(value, { stream: true });
                
                // 处理缓冲区中的完整行
                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; // 保留最后一个不完整的行
                
                // 处理完整的行
                for (const line of lines) {
                    if (line.trim()) {
                        try {
                            const result = JSON.parse(line.trim());
                            processStreamResult(result, rows);
                            processedCount++;
                            
                            // 如果所有域名都已处理完成，更新状态
                            if (processedCount >= domains.length) {
                                log('所有域名都已处理完成');
                                chrome.runtime.sendMessage({
                                    type: 'STATUS',
                                    active: true
                                });
                            }
                        } catch (e) {
                            console.error('解析JSON时出错:', e);
                        }
                    }
                }
            }

        } catch (error) {
            log('处理域名时出错', error);
            // 从待处理列表中移除失败的域名
            domains.forEach(domain => pendingDomains.delete(domain));
            chrome.runtime.sendMessage({
                type: 'STATUS',
                active: false
            });
        }
    }
}

// 处理流式结果
function processStreamResult(result, rows) {
    const [domain, explanation] = Object.entries(result)[0];
    if (domain && explanation) {
        // 将解释添加到页面
        addExplanationToPage(domain, explanation, rows);
        // 从待处理列表中移除已处理的域名
        pendingDomains.delete(domain);
        // 添加到已处理列表
        processedDomains.add(domain);
        log('处理了域名:', domain);
    }
}

// 新增：开始轮询
function startPolling(domains, rows) {
    // 清除之前的轮询
    if (pollingInterval) {
        clearInterval(pollingInterval);
    }

    let attempts = 0;
    const maxAttempts = 60; // 最多轮询30秒 (60 * 500ms)

    pollingInterval = setInterval(async () => {
        try {
            const response = await fetch('http://localhost:5001/get-results', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ domains: Array.from(pendingDomains) })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            
            // 处理返回的结果
            Object.entries(data).forEach(([domain, explanation]) => {
                if (explanation) {
                    // 将解释添加到页面
                    addExplanationToPage(domain, explanation, rows);
                    // 从待处理列表中移除已处理的域名
                    pendingDomains.delete(domain);
                    // 添加到已处理列表
                    processedDomains.add(domain);
                }
            });

            // 如果所有域名都处理完了，或者达到最大尝试次数，停止轮询
            if (pendingDomains.size === 0 || ++attempts >= maxAttempts) {
                clearInterval(pollingInterval);
                pollingInterval = null;
                
                // 更新插件状态
                chrome.runtime.sendMessage({
                    type: 'STATUS',
                    active: true
                });
            }

        } catch (error) {
            log('轮询获取结果时出错', error);
            clearInterval(pollingInterval);
            pollingInterval = null;
        }
    }, 500);  // 每500ms轮询一次
}

// 新增：将解释添加到页面的函数
function addExplanationToPage(domain, explanation, rows) {
    rows.forEach(row => {
        const domainCell = row.querySelector('td:nth-child(2)');
        if (domainCell) {
            const domainLink = getDomainLink(domainCell);
            if (domainLink && domainLink.textContent.trim() === domain) {
                if (!row.classList.contains('has-explanation')) {
                    // 标记原始行已被解释
                    row.classList.add('has-explanation');
                    
                    // 创建信息图标
                    const infoIcon = document.createElement('img');
                    infoIcon.src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNiIgaGVpZ2h0PSIxNiIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiM2NjY2NjYiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSIxMCI+PC9jaXJjbGU+PGxpbmUgeDE9IjEyIiB5MT0iMTYiIHgyPSIxMiIgeTI9IjEyIj48L2xpbmU+PGxpbmUgeDE9IjEyIiB5MT0iOCIgeDI9IjEyIiB5Mj0iOCI+PC9saW5lPjwvc3ZnPg==';
                    infoIcon.className = 'domain-info-icon';
                    infoIcon.width = 16;
                    infoIcon.height = 16;
                    
                    // 使用IIFE确保每个图标绑定正确的链接和解释
                    (function(icon, href, explanation) {
                        // 优化域名提取逻辑
                        const domainMatch = href.match(/website\/([^\/?#]+)\//);
                        const realDomain = domainMatch ? domainMatch[1] : null;
                        const realUrl = realDomain ? `https://${realDomain}` : href;

                        icon.addEventListener('click', function(e) {
                            e.preventDefault();
                            e.stopPropagation();
                            log('修正后的跳转链接:', realUrl);
                            window.open(realUrl, '_blank');
                        });

                        let tooltip = null;
                        let tooltipTimeout = null;

                        icon.addEventListener('mouseenter', function() {
                            log('鼠标进入图标，准备显示解释');

                            if (tooltipTimeout) {
                                clearTimeout(tooltipTimeout);
                                tooltipTimeout = null;
                            }

                            const existingTooltips = document.querySelectorAll('.domain-tooltip');
                            existingTooltips.forEach(t => t.remove());

                            tooltip = document.createElement('div');
                            tooltip.className = 'domain-tooltip';
                            tooltip.textContent = explanation;
                            document.body.appendChild(tooltip);

                            const rect = icon.getBoundingClientRect();

                            requestAnimationFrame(() => {
                                const tooltipRect = tooltip.getBoundingClientRect();

                                let left = rect.right + 10;
                                let top = rect.top + (rect.height - tooltipRect.height) / 2;

                                if (left + tooltipRect.width > window.innerWidth) {
                                    left = rect.left - tooltipRect.width - 10;
                                }

                                top = Math.max(0, Math.min(window.innerHeight - tooltipRect.height, top));

                                tooltip.style.left = `${left}px`;
                                tooltip.style.top = `${top}px`;

                                log('提示框已定位:', { left, top, width: tooltipRect.width, height: tooltipRect.height });
                            });
                        });

                        icon.addEventListener('mouseleave', function() {
                            log('鼠标离开图标，准备隐藏解释');

                            if (tooltip) {
                                tooltipTimeout = setTimeout(() => {
                                    if (tooltip) {
                                        tooltip.remove();
                                        tooltip = null;
                                    }
                                    tooltipTimeout = null;
                                }, 100);
                            }
                        });
                    })(infoIcon, domainLink.href, explanation);
                    
                    // 添加到域名单元格
                    domainLink.parentNode.insertBefore(infoIcon, domainLink.nextSibling);
                }
            }
        }
    });
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