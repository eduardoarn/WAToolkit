﻿/*
WhatsApp Toolkit
Author: Cristian Perez <http://www.cpr.name>
License: GNU GPLv3
*/


var debug = true;

var checkStatusInterval = 10000;
var checkSrcChatTrials = 25;
var checkSrcChatInterval = 400;
var checkBadgeInterval = 10000;

// Prevent page exit confirmation dialog. The content script's window object is not shared: http://stackoverflow.com/a/12396221/423171
var scriptElem = document.createElement("script");
scriptElem.innerHTML = "window.onbeforeunload = null;"
document.head.appendChild(scriptElem);

chrome.runtime.sendMessage({ name: "getIsBackgroundPage" }, function (isBackgroundPage)
{
	if (isBackgroundPage)
	{
		if (debug) console.info("WAT: Background script injected");

		backgroundScript();
	}
	else
	{
		if (debug) console.info("WAT: Foreground script injected");

		foregroundScript();
	}
});

function backgroundScript()
{
	proxyNotifications();
	reCheckStatus();
}

function foregroundScript()
{
	reCheckSrcChat(1);
	reCheckBadge();
}

// FOR BACKGROUND SCRIPT /////////////////////////////////////////////////////////////////////////

function proxyNotifications()
{
	// The content script's window object is not shared: http://stackoverflow.com/a/12396221/423171

	window.addEventListener("message", function (event)
	{
		if (event != undefined && event.data != undefined && event.data.name == "backgroundNotificationClicked")
		{
			chrome.runtime.sendMessage({ name: "backgroundNotificationClicked", srcChat: event.data.srcChat });
		}
	});
	
	var script =

	"var debug = " + debug + ";" +

	// Notification spec: https://developer.mozilla.org/en/docs/Web/API/notification

	// Save native notification
	"var _Notification = window.Notification;" +

	// Create proxy notification
	"var ProxyNotification = function (title, options)" + 
	"{" + 
		"if (debug) console.log('WAT: Notification creation intercepted');" +

		// Proxy constructor
		"var _notification = new _Notification(title, options);" + 

		// Proxy instance properties
		"this.title = _notification.title;" + 
		"this.dir = _notification.dir;" + 
		"this.lang = _notification.lang;" + 
		"this.body = _notification.body;" + 
		"this.tag = _notification.tag;" + 
		"this.icon = _notification.icon;" + 

		// Proxy event handlers
		"var that = this;" + 
		"_notification.onclick = function (event)" + 
		"{" + 
			"if (debug) console.log('WAT: Background notification click intercepted with event: ' + JSON.stringify(event));" + 

			"that.onclick(event);" +
			"var srcChat = undefined;" +
			"if (event != undefined && event.srcElement != undefined && typeof event.srcElement.tag == 'string')" +
			"{" +
				"if (debug) console.log('WAT: Background notification click intercepted with srcChat: ' + event.srcElement.tag);" + 

				"srcChat = event.srcElement.tag;" +
			"};" + 
			"window.postMessage({ name: 'backgroundNotificationClicked', srcChat: srcChat }, '*');" +
		"};" + 
		"_notification.onshow = function (event)" + 
		"{" + 
			"that.onshow(event);" + 
		"};" + 
		"_notification.onerror = function (event)" + 
		"{" + 
			"that.onerror(event);" + 
		"};" + 
		"_notification.onclose = function (event)" + 
		"{" + 
			"that.onclose(event);" + 
		"};" + 

		// Proxy instance methods
		"this.close = function ()" + 
		"{" + 
			"_notification.close();" + 
		"};" + 
		"this.addEventListener = function (type, listener, useCapture)" + 
		"{" + 
			"_notification.addEventListener(type, listener, useCapture);" + 
		"};" + 
		"this.removeEventListener = function (type, listener, useCapture)" + 
		"{" + 
			"_notification.removeEventListener(type, listener, useCapture);" + 
		"};" + 
		"this.dispatchEvent = function (event)" + 
		"{" + 
			"_notification.dispatchEvent(event);" + 
		"};" + 
	"};" + 

	// Proxy static properties
	"ProxyNotification.permission = _Notification.permission;" + 

	// Proxy static methods
	"ProxyNotification.requestPermission = _Notification.requestPermission;" + 

	// Replace native notification with proxy notification
	"window.Notification = ProxyNotification;";

	var scriptElem = document.createElement("script");
	scriptElem.innerHTML = script;
	document.head.appendChild(scriptElem);
}

function reCheckStatus()
{
	setTimeout(function () { checkStatus(); }, checkStatusInterval);
}

function checkStatus()
{
	if (debug) console.info("WAT: Checking status...");

	try
	{
		// Decides whether a background session is active
		var isSessionReady = document.getElementsByClassName('pane-list-user').length > 0 || document.getElementsByClassName('entry-main').length > 0;
		if (isSessionReady)
		{
			if (debug) console.info("WAT: Session is ready");

			reCheckStatus(); return;
		}
		else
		{
			if (debug) console.warn("WAT: Session is not ready, checking if should reconnect...");

			chrome.runtime.sendMessage({ name: "getAttemptReconnect" }, function (attemptReconnect)
			{
				if (attemptReconnect)
				{
					if (debug) console.info("WAT: Reconnecting...");

					window.location.reload();
				}
				else
				{
					if (debug) console.info("WAT: Not attempting to reconnect");
				}

				reCheckStatus(); return;
			});
		}
	}
	catch (err)
	{
		console.error("WAT: Exception while checking status");
		console.error(err);
		
		reCheckStatus(); return;
	}
}

// FOR FOREGROUND SCRIPT /////////////////////////////////////////////////////////////////////////

function reCheckSrcChat(trial)
{
	setTimeout(function () { checkSrcChat(trial); }, checkSrcChatInterval);
}

function checkSrcChat(trial)
{
	try
	{
		var paramPrefix = "#watSrcChat=";
		var srcChat = window.location.hash;
		if (typeof srcChat == "string" && srcChat.indexOf(paramPrefix) == 0)
		{
			srcChat = srcChat.substr(paramPrefix.length).replace(/\./g, "-");

			if (debug) console.info("WAT: Searching chat " + srcChat + " trial " + trial + "...");

			var found = false;
			var chats = document.getElementsByClassName("chat");
			for (var i = 0; i < chats.length; i++)
			{
				var chat = chats[i];
				var dataReactId = chat.getAttribute("data-reactid")
				if ((typeof dataReactId == "string") && dataReactId.indexOf(srcChat) > -1)
				{
					chat.click();
					setTimeout(function() { window.scrollTo(0, 0); }, 500);
					setTimeout(function() { window.scrollTo(0, 0); }, 1000); // Fixes some strange page misposition that happens only sometimes
					found = true;
					break;
				}
			}

			if (found)
			{
				if (debug) console.info("WAT: Found and clicked chat");

				history.replaceState({}, document.title, "/");
			}
			else
			{
				if (trial < checkSrcChatTrials)
				{
					if (debug) console.warn("WAT: Chat not found");

					reCheckSrcChat(trial + 1);
				}
				else
				{
					if (debug) console.error("WAT: Chat not found");
				}
			}
		}
	}
	catch (err)
	{
		console.error("WAT: Exception while checking source chat");
		console.error(err);
	}
}

function reCheckBadge()
{
	setTimeout(function () { checkBadge(); }, checkBadgeInterval);
}

function checkBadge()
{
	if (debug) console.info("WAT: Checking badge...");
	
	try
	{
		var areChatsReady = document.getElementsByClassName('pane-list-user').length > 0;
		if (areChatsReady)
		{
			var unreadCount = 0;
			var unreadCountElems = document.getElementsByClassName("unread-count");
			for (var i = 0; i < unreadCountElems.length; i++)
			{
				unreadCount += parseInt(unreadCountElems[i].textContent);
			}
			var badgeText = "";
			if (unreadCount > 0)
			{
				badgeText = unreadCount.toString();
			}
			chrome.runtime.sendMessage({ name: "setBadge", badgeText: badgeText });
		}

		reCheckBadge();
	}
	catch (err)
	{
		console.error("WAT: Exception while checking badge");
		console.error(err);
	}
}