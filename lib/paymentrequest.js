"use strict";

var _lastPaymentRequestId = 0;

function PaymentRequest(supportedMethods,details,options,data) {
    // Constructor code
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
	var _request = this;
	var _messageHandler = null;

    // Ensure details is valid
    if(_details.items===undefined || !Array.isArray(_details.items) || _details.items.length<1) {
        throw { name: "InvalidAccessError", message: "details must contain at least one item" };
    }
    // Set default for requestShipping
    if(_options.requestShipping===undefined) {
        _options.requestShipping = false;
    }
    // Ensure data is valid - attributes must match supported methods
    for(var c in _data) {
        if(_supportedMethods.indexOf(c)<0) {
            throw { name: "InvalidAccessError", message: "values in payment method specific data must match supportedMethods" };
        }
    }

	this.show = function() {
		if(_state!="created") {
            throw { name: "InvalidStateError", message: "show() can only be called in the created state" };
        }

		_state = "interactive";

		return new Promise(function(resolve,reject) {
			_approvePaymentResolve = resolve;
			_approvePaymentReject = reject;

			if(_options.__walletUrl) {
				setupWallet(_options.__walletUrl);
            } else if(window.__walletUrl) {
                setupWallet(window.__walletUrl);
			} else if(location.hostname=="localhost") { // for debugging
                setupWallet('lib/wallet.html');
            } else {
                setupWallet('http://github.adrianba.net/paymentrequest-demo/lib/wallet.html');
            }
		});
	};

	this.abort = function() {
		if(_state!="interactive") throw { name: "InvalidStateError", message: "abort() only works in interactive state"};
		_state = "closed";
		disposeWallet();
	};

	this.onshippingaddresschange = function() {};
	this.onshippingoptionchange = function() {};
	this.shippingAddress = null;
	this.shippingOption = null;
	//Object.defineProperty(this,"state", { get: function() { return _state; }});
    Object.defineProperty(this,"_debugOnlyState", { get: function() { return _state; }});

	function setupWallet(url) {
		_walletFrame = document.createElement("iframe");
		_walletFrame.src = url;
        _walletFrame.setAttribute("style","position:absolute;left:0px;top:0px;width:100%;height:100%;border:0px;");
		_walletFrame.addEventListener("load",oninit,false);
		document.body.appendChild(_walletFrame);

		_messageHandler = onmessage.bind(_request);
		window.addEventListener("message",_messageHandler,false);
	}

	function acceptPayment(responseData) {
		if(_state!="interactive" || _updating) throw { name: "InvalidStateError" };
		_state = "closed";
        var response = new PaymentResponse(responseData);
		_approvePaymentResolve(response);
	}

	function rejectPromise(data) {
		_state = "closed";
		disposeWallet();
		_approvePaymentReject(data);
	}

	function shippingAddressChange(address) {
		if(_state!="interactive" || _updating) throw { name: "InvalidStateError" };
		_request.shippingAddress = address;
		var e = new PaymentRequestUpdateEvent("shippingaddresschange", { __update:update });
		_updating = true;
		_request.onshippingaddresschange(e);
	}

	function shippingOptionChange(optionid) {
		if(_state!="interactive" || _updating) throw { name: "InvalidStateError" };
		_request.shippingOption = optionid;
		var e = new PaymentRequestUpdateEvent("shippingoptionchange", { __update:update });
		_updating = true;
		_request.onshippingoptionchange(e);
	}

	function update(details) {
		_updating = false;
		postToWallet("update",details);
	}

	function oninit() {
		_walletFrame.removeEventListener("load",oninit,false);
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

			case "shippingaddresschange":
				shippingAddressChange(cmd.data);
				break;

			case "shippingoptionchange":
				shippingOptionChange(cmd.data);
				break;

			default:
				// unknown command
				throw { name: "InvalidAccessError" };
		}
	}

	function disposeWallet() {
		if(_messageHandler) {
			window.removeEventListener("message",_messageHandler,false);
			_messageHandler = null;
		}
		if(_walletFrame) {
			document.body.removeChild(_walletFrame);
			_walletFrame = null;
		}
	}

    function completeWallet(success) {
        return new Promise(function(resolve,reject) {
            disposeWallet();
            resolve(undefined);
        });
    }

    function PaymentResponse(responseData) {
        var _complete = false;
        this.methodName = responseData.methodName;
        this.details = responseData.details;

        this.complete = function(success) {
            if(_complete) {
                throw { name: "InvalidStateError", message: "complete can only be called once" };
            }
            _complete = true;
            return completeWallet(success);
        }
    }
}

function PaymentRequestUpdateEvent(type,eventinit) {
	var _type = type;
	var _update = eventinit.__update;

	this.updatePaymentRequest = function(details) {
		_update(details);
	}
}
