(function () {
  'use strict';

  // expose an object to call from inline onclicks if needed
  window.appInstance = null;

  const params = new URLSearchParams(window.location.search);
  const room = params.get('room');
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
        try {
          if (skipNames.indexOf(sender.toLowerCase()) !== -1) return;
        } catch (e) { /* ignore */ }

        var type = sender === states.name ? 'sent' : 'received';
        var displayName = type === 'sent' ? states.name : sender;
        states.msgs.push({ name: `${msg.time} | ${displayName}`, text: msg.text, type: type });
        // Browser notification: focus already-open window/tab on click
        if (Notification.permission === 'granted' && (document.hidden || !document.hasFocus())) {
          try {
            const n = new Notification(room + " | " + sender, {
              body: msg.text,
              // icon: '/icons/msg.png' // optional
            });
            n.onclick = function () {
              try { window.focus(); } catch (e) {}
              try {
                if (window.appInstance && window.appInstance.$f7 && window.appInstance.$f7.mainView) {
                  // navigate to chat route (adjust if your router differs)
                  window.appInstance.$f7.mainView.router.navigate('/chat/');
                } else {
                  // fallback: ensure current URL includes room and reload to show chat
                  window.location.href = window.location.pathname + window.location.search;
                }
              } catch (e) {}
              n.close();
            };
          } catch (e) {
            // notifications may throw in some contexts
          }
        }
      }
    });

    if (room) {
      pubnub.subscribe({ channels: [room] });

      pubnub.history({ channel: room, count: 200 }, function (status, response) {
        var history = response && response.messages ? response.messages : [];
        for (var i = 0; i < history.length; i++) {
          var entry = history[i].entry || {};
          var sender = entry.name || '';
          try {
            if (skipNames.indexOf(sender.toLowerCase()) !== -1) continue;
          } catch (e) {}
          var type = sender === states.name ? 'sent' : 'received';
          if (!entry.time) {states.msgs.push({ name: sender, text: entry.text, type: type })}
          else {states.msgs.push({ name: `${entry.time} | ${sender}`, text: entry.text, type: type })};
        }
      });
    } else {
      console.warn('No room specified; skipping PubNub subscribe/history.');
    }
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
		  const pad2 = n => String(n).padStart(2, '0');
          let now = new Date();
          let h = now.getHours();
          const ampm = h >= 12 ? 'PM' : 'AM';
          h = h % 12 || 12;
		  const fmt = new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short' });
	      let date =fmt.format(now).replace(' ', ' '); // e.g. "31, May"
          let time = `${date}, ${pad2(h)}:${pad2(now.getMinutes())} ${ampm}`;


          pubnub.publish({
            channel: room,
            message: {
              text: text,
              name: this.name,
              time: time,
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
          var comp = self.$refs.msgbar;
          if (!comp) return;
          var container = comp.$el || comp.el || comp;
          if (!container || typeof container.querySelector !== 'function') return;

          var ta = container.querySelector('textarea') || container.querySelector('input');

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

    var app = new Vue({
      el: '#app',
      data: function () {
        return states;
      },
      methods: {
        enterChat: function () {
          this.name = document.getElementById("nameinput").value || '';
          if (this.name.trim().length === 0) {
            alert('Please enter your name');
            return false;
          }
          if (!room) {
            alert('Join a room first');
            return false;
          }
          if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      		try { Notification.requestPermission(); } catch (e) {}
      		console.log("set notification permission")
    	  }
          var titleEl = document.getElementById("title");
          if (titleEl) titleEl.innerHTML = room;
          localStorage.setItem("name", this.name);
          localStorage.setItem("enterchat", true);
          this.msgs.length = 0;
          // show app root and hide join
          var joinEl = document.getElementById('join');
          var appRoot = document.getElementById('app-root');
          if (joinEl) joinEl.style.display = 'none';
          if (appRoot) appRoot.style.display = '';
          // load chat route if router exists
          try {
            if (this.$f7 && this.$f7.mainView) {
              this.$f7.mainView.router.load({ url: '/chat/' });
            }
          } catch (e) {}
          initPubNub();
        },
        setroom: function () {
          let roomtext = (document.getElementById("roominput") || {}).value || '';
          if (roomtext.trim().length === 0) {
            alert('Please enter a valid room');
            return false;
          }
          let u = new URL(window.location.href);
          let url = u.origin + u.pathname;
          localStorage.setItem("enterchat", true)
          window.open(`${url}?room=${encodeURIComponent(roomtext)}`, "_self");
        }
      },
      framework7: {
        root: '#app',
        material: Framework7.prototype.device && Framework7.prototype.device.android ? true : false,
        routes: [{
          path: '/chat/',
          component: 'page-chat'
        }]
      },
      mounted: function () {
        // attach global ref for external calls
        window.appInstance = this;
      }
    });

    // store instance globally as well
    window.appInstance = app;
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (!localStorage.getItem('name')) { localStorage.setItem('name', ''); }
    if (Framework7.prototype.device && Framework7.prototype.device.android) {
      Dom7('.view.navbar-through').removeClass('navbar-through').addClass('navbar-fixed');
      Dom7('.view .navbar').prependTo('.view .page');
    }

    // request notification permission up front (optional

    initVue();

    var nameInput = document.getElementById("nameinput");
    if (nameInput) nameInput.value = localStorage.getItem('name') || '';
    var roomInput = document.getElementById("roominput");
    if (roomInput) roomInput.value = room || '';
    var titleEl = document.getElementById("title");
    if (titleEl) titleEl.innerHTML = "Chat";
    if (!room) {
      localStorage.setItem("enterchat", false)
      var namediv = document.getElementById('namediv');
      var nametitle = document.getElementById('nametitle');
      if (namediv) namediv.remove();
      if (nametitle) nametitle.remove();
    }
	if (localStorage.getItem("enterchat")) {window.appInstance.enterChat()};

    // enable Framework7 dark theme class if desired
    document.documentElement.classList.add('theme-dark');
  }, false);

})();
