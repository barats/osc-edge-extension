chrome.browserAction.setBadgeBackgroundColor({
    color: [190, 190, 190, 230]
});

chrome.runtime.onInstalled.addListener(function () {
    console.log('OSCHINA Microsoft Edge Extension installed.');
});

chrome.browserAction.onClicked.addListener(function () {
    chrome.tabs.create({
        url: "html/oschina.html"
    }, function (tab) {
        console.log('tab is:' + tab);
    });
});