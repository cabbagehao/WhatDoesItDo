// 日志函数
function log(message, data = null) {
    const timestamp = new Date().toISOString();
    if (data) {
        console.log(`[Domain Explainer Background ${timestamp}]`, message, data);
    } else {
        console.log(`[Domain Explainer Background ${timestamp}]`, message);
    }
}

// 监听插件安装事件
chrome.runtime.onInstalled.addListener(() => {
    log('插件已安装');
});

// 监听文件变化并自动重载插件
function watchForChanges() {
    log('开始监听文件变化');
    
    // 获取当前目录下所有文件的时间戳
    const getFilesTimestamp = () => new Promise((resolve) => {
        chrome.runtime.getPackageDirectoryEntry((root) => {
            root.createReader().readEntries((entries) => {
                const files = entries.filter(e => e.isFile);
                Promise.all(
                    files.map(file => new Promise((resolve) => {
                        file.getMetadata((metadata) => {
                            resolve({
                                name: file.name,
                                timestamp: metadata.modificationTime.getTime()
                            });
                        });
                    }))
                ).then((filesData) => {
                    log('当前目录文件列表', filesData);
                    resolve(filesData);
                });
            });
        });
    });

    // 重新加载content script
    const reloadContentScript = async () => {
        log('检测到文件变化，准备重新加载');
        
        // 获取所有打开的标签页
        const tabs = await chrome.tabs.query({url: "https://*.semrush.com/*"});
        log('找到相关标签页', tabs.length);
        
        // 重新注入content script
        for (const tab of tabs) {
            try {
                log(`重新注入content script到标签页 ${tab.id}`);
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['content.js']
                });
                log(`标签页 ${tab.id} 注入成功`);
            } catch (error) {
                log(`标签页 ${tab.id} 注入失败`, error);
            }
        }
        
        // 如果没有找到相关标签页，重载整个插件
        if (tabs.length === 0) {
            log('未找到相关标签页，重载整个插件');
            chrome.runtime.reload();
        }
    };

    // 开始监听文件变化
    let lastTimestamps = null;
    const checkChanges = async () => {
        const currentTimestamps = await getFilesTimestamp();
        
        if (lastTimestamps) {
            // 检查是否有文件发生变化
            const hasChanges = currentTimestamps.some(current => {
                const previous = lastTimestamps.find(last => last.name === current.name);
                return !previous || previous.timestamp !== current.timestamp;
            });
            
            if (hasChanges) {
                log('检测到文件变化');
                await reloadContentScript();
            }
        }
        
        lastTimestamps = currentTimestamps;
        setTimeout(checkChanges, 1000); // 每秒检查一次
    };

    // 启动监听
    checkChanges();
    log('文件监听器已启动');
}

// 启动文件监听（仅在开发模式下）
if (chrome.runtime.getManifest().version === '1.0') {
    watchForChanges();
}

// 监听来自content script的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    log('收到消息', { request, tabId: sender.tab.id });
    
    if (request.type === 'STATUS') {
        log('处理状态更新', request.active);
        
        // 更新插件图标状态
        chrome.action.setBadgeText({
            text: request.active ? 'ON' : 'OFF',
            tabId: sender.tab.id
        }).then(() => {
            return chrome.action.setBadgeBackgroundColor({
                color: request.active ? '#00FF00' : '#FF0000',
                tabId: sender.tab.id
            });
        }).then(() => {
            log('图标状态更新成功');
            // 立即发送响应
            sendResponse({received: true});
        }).catch(error => {
            log('图标状态更新失败', error);
            sendResponse({received: false, error: error.message});
        });
    }
    // 返回true表示将异步发送响应
    return true;
}); 