"use strict";

var _lastPaymentRequestId = 0;

function PaymentRequest(supportedMethods,details,options,data) {
    // Constructor code
	if(!Array.isArray(supportedMethods) || supportedMethods.length==0) throw new TypeError("supportedMethods must be a non-empty sequence of strings");
	if(typeof details !== "object") throw new TypeError("details must be an object");
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
        throw new TypeError("details must contain at least one item");
    }
    // Set default for requestShipping
    if(_options.requestShipping===undefined) {
        _options.requestShipping = false;
    }
    // Ensure data is valid - attributes must match supported methods
    for(var c in _data) {
        if(_supportedMethods.indexOf(c)<0) {
            throw new TypeError("values in payment method specific data must match supportedMethods");
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
        document.body.style.overflowY = "hidden"; // not the best way but just for the demo

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
		_request.onshippingaddresschange(e);
	}

	function shippingOptionChange(data) {
		if(_state!="interactive" || _updating) throw { name: "InvalidStateError" };
		_request.shippingOption = data.id;
        if(data.fireEvent) {
    		var e = new PaymentRequestUpdateEvent("shippingoptionchange", { __update:update });
    		_request.onshippingoptionchange(e);
        }
	}

	function update(details) {
		postToWallet("update",details);
	}

    function setUpdating(updating) {
        _updating = updating;
        postToWallet("updating",updating);
    }

	function oninit() {
		_walletFrame.removeEventListener("load",oninit,false);
		postToWallet("init",{
			supportedMethods: _supportedMethods,
			details: _details,
			options: _options,
			data: _data,
            origin: window.location.hostname
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
            document.body.style.overflowY = ""; // demo only
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

    function PaymentRequestUpdateEvent(type,eventinit) {
        var _type = type;
        var _waitForUpdate = false;
        var disableElement = null;
        var timeoutId = null;

        this.updateWith = function(d) {
            if(_waitForUpdate) throw { name: "InvalidStateError", message: "updateWith can only be called once on an event instance" };
            if(_state!="interactive") throw { name: "InvalidStateError", message: "updateWith should only be called in the interactive state"};
            if(_updating) throw { name: "InvalidStateError", message: "only one update can be processed at a time"};

            _waitForUpdate = true;
            setUpdating(true);

            // need to disable UX here if this takes a while
            timeoutId = setTimeout(showProgressIndicator,75);

            d.then(function(details) {
                update(details);
                promiseSettled();
            })
            .catch(function(e) {
                promiseSettled();
            });
        };

        function promiseSettled() {
            // need to enable UX here
            if(timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }
            if(disableElement) {
                document.body.removeChild(disableElement);
                disableElement = null;
            }
            _waitForUpdate = false;
            setUpdating(false);
        }

        function showProgressIndicator() {
            disableElement = document.createElement("div");
            disableElement.style.position = "fixed";
            disableElement.style.top = "0px";
            disableElement.style.left = "0px";
            disableElement.style.width = "100%";
            disableElement.style.height = "100%";
            disableElement.style.opacity = 0.75;
            disableElement.style.backgroundColor = "black";
            document.body.appendChild(disableElement);
            var div = document.createElement("div");
            div.style.display = "flex";
            div.style.width = "100%";
            div.style.height = "100%";
            div.style.alignItems = "center";
            div.style.justifyContent = "center";
            disableElement.appendChild(div);
            var progress = document.createElement("progress");
            progress.style.width = "400px";
            progress.style.height = "50px";
            div.appendChild(progress);
            timeoutId = null;
        }
    }
}

