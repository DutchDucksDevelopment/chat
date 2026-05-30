(function () {
  'use strict';

  const params = new URLSearchParams(window.location.search);
  const room = params.get('room')
  console.log('room:', room);

  var pubnub = new PubNub({
    publishKey: 'demo',
    subscribeKey: 'demo'
  });

  var states = {
    name: '',
    msgs: []
  };

  var skipNames = ['chris', 'romain'];

  function initPubNub() {
    pubnub.addListener({
      message: function (data) {
        var msg = data && data.message ? data.message : {};
        var sender = msg.name || '';
        if (skipNames.indexOf(sender.toLowerCase()) !== -1) return;

        var type = sender === states.name ? 'sent' : 'received';
        var displayName = type === 'sent' ? states.name : sender;
        states.msgs.push({ name: displayName, text: msg.text, type: type });
      }
    });

    pubnub.subscribe({ channels: [room] });

    pubnub.history({ channel: room, count: 100 }, function (status, response) {
      var history = response && response.messages ? response.messages : [];
      for (var i = 0; i < history.length; i++) {
        var entry = history[i].entry || {};
        var sender = entry.name || '';
        if (skipNames.indexOf(sender.toLowerCase()) !== -1) continue;

        var type = sender === states.name ? 'sent' : 'received';
        states.msgs.push({
          name: sender,
          text: entry.text,
          type: type
        });
      }
    });
  }

  function initVue() {
    Vue.use(Framework7Vue);

    Vue.component('page-chat', {
      template: '#page-chat',
      data: function () {
        return states;
      },
      methods: {
        onSend: function (text, clear) {
          if (!text || text.trim().length === 0) return;
          let now = new Date();
		  let hours = now.getHours();
		  let minutes = now.getMinutes();
		  let seconds = now.getSeconds();
		  let time = `${hours} : ${minutes} : ${seconds}`
          pubnub.publish({
            channel: room,
            message: {
              text: `${time} | ${text}`,
              name: this.name
            }
          });
          if (typeof clear === 'function') clear();
        },
        messagebarSubmit: function (event) {
          var detail = event && event.detail ? event.detail : {};
          var value = detail.value || '';
          var clearFn = typeof detail.clear === 'function' ? detail.clear : null;
          if (!value || value.trim().length === 0) return;
          this.onSend(value, clearFn);
        }
      },
      mounted: function () {
        var self = this;
        this.$nextTick(function () {
          // this.$refs.msgbar is the Framework7-Vue component instance, get its DOM element
          var comp = self.$refs.msgbar;
          if (!comp) return;
          var container = comp.$el || comp.el || comp;
          if (!container || typeof container.querySelector !== 'function') return;

          // find textarea (Framework7 renders a textarea inside messagebar)
          var ta = container.querySelector('textarea') || container.querySelector('input');

          // Enter key sends (no Shift)
          if (ta) {
            ta.addEventListener('keydown', function (e) {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                var value = ta.value || '';
                if (!value.trim()) return;
                var clearFn = function () { ta.value = ''; };
                if (comp.f7Messagebar && typeof comp.f7Messagebar.clear === 'function') {
                  clearFn = function () { comp.f7Messagebar.clear(); };
                }
                self.onSend(value, clearFn);
              }
            });
          }
          
          // find send button and attach click (fallback if v-on:submit doesn't fire)
          var sendBtn = container.querySelector('.messagebar-send, .button, .link') ||
                        Array.from(container.querySelectorAll('button, a')).find(el => el.textContent.trim().toLowerCase() === 'send');
          if (sendBtn) {
            sendBtn.addEventListener('click', function (e) {
              e.preventDefault();
              var value = '';
              if (comp.f7Messagebar && typeof comp.f7Messagebar.value === 'function') {
                value = comp.f7Messagebar.value();
              } else if (ta) {
                value = ta.value;
              }
              if (!value || !value.trim()) return;
              var clearFn = function () { if (ta) ta.value = ''; };
              if (comp.f7Messagebar && typeof comp.f7Messagebar.clear === 'function') {
                clearFn = function () { comp.f7Messagebar.clear(); };
              }
              self.onSend(value, clearFn);
            });
          }
        });
      }
    });

    new Vue({
      el: '#app',
      data: function () {
        return states;
      },
      methods: {
        enterChat: function () {
          this.name = document.getElementById("nameinput").value
          if (this.name.trim().length === 0) {
            alert('Please enter your name');
            return false;
          }
          if (room == null) {
          	alert('Join a room first');
            return false;
          }
          localStorage.setItem("name", this.name)
          this.msgs.length = 0;
          this.$f7.mainView.router.load({ url: '/chat/' });
          initPubNub();
        },
        setroom: function () {
          let roomtext = document.getElementById("roominput").value
          if (roomtext.trim().length === 0) {
          	console.log(roomtext.trim())
            alert('Please enter a valid room');
            return false;
          }
		  let u = new URL(window.location.href);
		  let url = u.origin + u.pathname
		  window.open(`${url}?room=${roomtext}`, "_self")
        }
      },
      framework7: {
        root: '#app',
        material: Framework7.prototype.device && Framework7.prototype.device.android ? true : false,
        routes: [{
          path: '/chat/',
          component: 'page-chat'
        }]
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var roomname = document.getElementById("roomtitle");
    console.log("here")
	if (room != "server") {
		roomname.innerHTML = room;
		console.log("set innerHTML")
	};	
	if (!localStorage.getItem('name')) {localStorage.setItem('name', '')}
    if (Framework7.prototype.device && Framework7.prototype.device.android) {
      Dom7('.view.navbar-through').removeClass('navbar-through').addClass('navbar-fixed');
      Dom7('.view .navbar').prependTo('.view .page');
    }
    initVue();
    document.getElementById("nameinput").value = localStorage.getItem('name')
	console.log(document.getElementById("nameinput").value + localStorage.getItem('name'))
	document.getElementById("roominput").value = room
	if (!room) {document.getElementById('namediv').remove()};
  }, false);

})();
