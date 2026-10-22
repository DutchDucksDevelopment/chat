(function () {
  'use strict';
  window.appInstance = null;
  const params = new URLSearchParams(window.location.search);
  let room = params.get('room');
  if (!room) {
	  room = "DDD Chat"
  }
  let nameparam = params.get('name');
  console.log('[debug] room:', room);
  console.log('[debug] name:', localStorage.getItem("name"));
  var pubnub = new PubNub({
    publishKey: 'pub-c-178b19ef-30ce-48c9-8885-5ba42c6702a1',
    subscribeKey: 'sub-c-1147d9ae-48c7-4568-a362-cbff1519b83f'
  });
  var stealthmode = localStorage.getItem("stealthmode");
  var states = {
    name: '',
    msgs: []
  };

  function formatMessageTime(timestamp) {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(timestamp));
  }

  const style = document.createElement("style");
  style.textContent = `
:root {
      color-scheme: dark !important;
    }

    html {
      background-color: #121212 !important;
      filter: invert(0.92) hue-rotate(180deg) brightness(var(--force-dark-brightness, 100%)) contrast(var(--force-dark-contrast, 100%)) sepia(var(--force-dark-sepia, 0%)) !important;
    }

    /*
     * Known limitation: this unconditionally re-inverts every image/canvas
     * regardless of whether the site already inverted it itself (e.g. an
     * icon with a Tailwind "dark:invert" class driven by the real system
     * prefers-color-scheme). On those sites this double-inverts the icon
     * back to its original (now-invisible) color. See README's Theme
     * Engines section. No general fix without risking the common case this
     * rule exists for: un-inverting ordinary images on the vast majority
     * of sites that don't do their own conditional icon inversion.
     */
    img,
    video,
    canvas,
    picture,
    embed,
    object,
    [style*="background-image"] {
      filter: invert(1) hue-rotate(180deg) !important;
    }

    /* Prevent double inversion on media nested inside picture or video */
    picture img,
    picture video,
    video img {
      filter: none !important;
    }
  `;

  document.head.appendChild(style);
  if (!stealthmode) {localStorage.setItem("stealthmode", false)}
  var skipNames = []; //Blacklist
  var messagecount = 0

  function initPubNub() {
    pubnub.addListener({
      message: function (data) {
        var msg = data && data.message ? data.message : {};
        var sender = msg.name || '';
        try {
          if (skipNames.indexOf(sender.toLowerCase()) !== -1) return;
        } catch (e) { /* ignore */ }
        messagecount = messagecount + 1
        console.log('[debug] ', messagecount)
        console.log('[debug] ', stealthmode)
        console.log('[debug] ', document.hidden)
        console.log('[debug] ', document.hasFocus())
		if (stealthmode && !document.hasFocus()) {
		  console.log("[debug] Unfocused")
  		  document.title = `(${messagecount}) DDD chat`;
		}
        var type = sender === states.name ? 'sent' : 'received';
        var displayName = type === 'sent' ? states.name : sender;
        var time = msg.timestamp
          ? formatMessageTime(msg.timestamp)
          : (msg.time || '');
        states.msgs.push({ name: time ? `${time} | ${displayName}` : displayName, text: msg.text, type: type });
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
          var time = entry.timestamp
            ? formatMessageTime(entry.timestamp)
            : (entry.time || '');
          if (!time) {states.msgs.push({ name: sender, text: entry.text, type: type })}
          else {states.msgs.push({ name: `${time} | ${sender}`, text: entry.text, type: type })};
        }
      });
    } else {
	  console.log("[debug] no room")
	  room = "DDD Chat"
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
		  const timestamp = new Date().toISOString();


          pubnub.publish({
            channel: room,
            message: {
              text: text,
              name: this.name,
              timestamp: timestamp,
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
		  console.log("[debug] enterchat pressed")
          this.name = document.getElementById("nameinput").value || '';
          if (this.name.trim().length === 0) {
            return false;
          }
          if (!room) {
            alert('Join a room first');
            return false;
          }
          if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      		try { Notification.requestPermission(); } catch (e) {}
      		console.log("[debug] set notification permission")
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
        },
        openstealth: function () {
        	stealthmode = localStorage.getItem("stealthmode")
        	if (stealthmode == "true") {
        		localStorage.setItem("stealthmode", false)
        		console.log("[debug] google")
        		messagecount = 0
  				document.title = "DDD chat"
  				let link = document.querySelector("link[rel~='icon']");
  				link.href = "img/logochat.png"	
        	}
			else {
				localStorage.setItem("stealthmode", true)
				console.log("[debug] not google")
				document.title = "Google"
  				let link = document.querySelector("link[rel~='icon']");
  				link.href = "img/logogoogle.png"	
			}
			stealthmode = localStorage.getItem("stealthmode")
			console.log("[debug] ", stealthmode)	
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


    initVue();
	window.addEventListener('focus', () => {
  		console.log('[debug] window focused');
  		if (stealthmode) {
  			document.title = "DDD chat";
  			messagecount = 0;
  		}
	});
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
    if (stealthmode == "false") {
		console.log('[debug] set title')
  		messagecount = 0
  		document.title = "DDD chat"
  		let link = document.querySelector("link[rel~='icon']");
  		link.href = "img/logochat.png"
  	}
    console.log('[debug]', stealthmode)
    stealthmode = localStorage.getItem("stealthmode")
  }, false);
  

})();
