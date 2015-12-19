"use strict";

function PaymentRequestWalletHelper() {
	var _id = 0;
	var _messageHandler = onMessage.bind(this);
	window.addEventListener("message",_messageHandler,false);

	this.dispose = function() {
		window.removeEventListener("message",_messageHandler,false);
	}

	this.acceptPayment = function(response) {
		post("accept",response);
	}

	this.rejectPromise = function(data) {
		post("reject",data);
	}

	this.setShippingAddress = function(address) {
		post("shippingaddresschange",address);
	}

	this.setShippingOption = function(optionid) {
		post("shippingoptionchange",optionid);
	}

	this.oninit = function(data) {};
	this.onupdate = function(data) {};

	function post(name,data) {
		window.parent.postMessage({name:name,id:_id,data:data},"*");
	}

	function onMessage(msg) {
		var cmd = msg.data;
		if(!cmd.id || !cmd.name || (_id!=0 && cmd.id!=_id)) return; // message is not for us
		switch(cmd.name) {
			case "init":
				_id = cmd.id;
				this.oninit(cmd.data);
				break;
			case "update":
				post("updated");
				this.onupdate(cmd.data);
				break;
			default:
				throw { name: "InvalidAccessError" };
		}
	}

	this.acceptedMethodIntersection = function(supported,accepted) {
		var results = [];
		for(var i=0; i<supported.length; i++) {
			if(accepted.indexOf(supported[i])>=0) {
				results.push(supported[i]);
			}
		}
		return results;
	}
}