"use strict";

var _lastPaymentRequestId = 0;

function PaymentRequest(supportedMethods,details,options,data) {
	if(!Array.isArray(supportedMethods) || supportedMethods.length==0) throw new SyntaxError();
	if(typeof details !== "object") throw new SyntaxError();
	if(options===undefined) options = {};
	if(data===undefined) data = {};
	var _id = ++_lastPaymentRequestId;
	var _supportedMethods = JSON.parse(JSON.stringify(supportedMethods));
	var _details = JSON.parse(JSON.stringify(details));
	var _options = JSON.parse(JSON.stringify(options));
	var _data = JSON.parse(JSON.stringify(data));
	var _approvePaymentResolve, _approvePaymentReject;
	var _updating = false;
	var _state = "created";
	var _walletFrame = null;
	var _walletInit = null;
	var _messageHandler = null;

	this.show = function() {
		if(_state!="created") throw { name: "InvalidStateError", message: "show() can only be called in the created state" };
		_state = "interactive";
		var that = this;
		return new Promise(function(resolve,reject) {
			_approvePaymentResolve = resolve;
			_approvePaymentReject = reject;

			// Ensure details is valid
			if(_details.items===undefined || !Array.isArray(_details.items) || _details.items.length<1) {
				_state = "closed";
				_approvePaymentReject({name:"InvalidAccessError", message: "details must contain at least 1 item"});
				return;
			}

			// Set default for requestShipping
			if(_options.requestShipping===undefined) {
				_options.requestShipping = false;
			}

			// Ensure data is valid - attributes must match supported methods
			for(var c in _data) {
				if(_supportedMethods.indexOf(c)<0) {
					_state = "closed";
					_approvePaymentReject({name:"InvalidAccessError", message:"values in payment method specific data must match supportedMethods"});
					return;
				}
			}

			if(_options.__walletUrl) {
				setupWallet(_options.__walletUrl);
			}
		});
	};

	this.abort = function() {
		if(_state!="interactive") throw { name: "InvalidStateError", message: "abort() only works in interactive state"};
		_state = "closed";
		disposeWallet();
	};

	this.complete = function(success) {
		if(_state!="accepted")  throw { name: "InvalidStateError", message: "complete() only works in accepted state"};
		_state = "closed";
		disposeWallet();
	};

	this.onshippingaddresschange = function() {};
	this.onshippingoptionchange = function() {};
	this.shippingAddress = null;
	this.shippingOption = null;
	Object.defineProperty(this,"state", { get: function() { return _state; }});

	function setupWallet(url) {
		_walletFrame = document.createElement("iframe");
		_walletFrame.src = url;
		_walletFrame.height = 500;
		_walletFrame.width = "100%";
		_walletFrame.style.display = "none";
		_walletInit = oninit.bind(this);
		_walletFrame.addEventListener("load",_walletInit,false);
		document.body.appendChild(_walletFrame);

		_messageHandler = onmessage.bind(this);
		addEventListener("message",_messageHandler,false);
	}

	function acceptPayment(response) {
		// Accept payment request - this is temporary and should actually get the user to accept
		_state = "accepted";
		_approvePaymentResolve(response);
	}

	function rejectPromise(data) {
		_state = "closed";
		disposeWallet();
		_approvePaymentReject(data);
	}

	function oninit() {
		_walletFrame.removeEventListener("load",_walletInit,false);
		_walletInit = null;
		postToWallet("init",{
			supportedMethods: _supportedMethods,
			details: _details,
			options: _options,
			data: _data,
		});
	}

	function postToWallet(name,data) {
		_walletFrame.contentWindow.postMessage({name:name,id:_id,data:data},"*");
	}

	function onmessage(msg) {
		var cmd = msg.data;
		if(!cmd.id || cmd.id!=_id) return; // this message wasn't for us
		switch(cmd.name) {
			case "accept":
				acceptPayment(cmd.data);
				break;

			case "reject":
				rejectPromise(cmd.data);
				break;

			default:
				// unknown command
				throw { name: "InvalidAccessError" };
		}
	}

	function disposeWallet() {
		if(_messageHandler) {
			removeEventListener("message",_messageHandler,false);
			_messageHandler = null;
		}
		if(_walletFrame) {
			document.body.removeChild(_walletFrame);
			_walletFrame = null;
		}
	}
}