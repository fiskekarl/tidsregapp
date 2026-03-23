sap.ui.define([
  'sap/ui/core/mvc/Controller',
  'sap/ui/core/routing/History',
  'sap/m/MessageBox',
  'sap/base/i18n/Localization'
], function (Controller, History, MessageBox, Localization) {
  'use strict';

  const API_BASE = '/api/time/login';

  return Controller.extend('com.timeregistration.kiosk.controller.Idle', {

    // -------------------------------------------------------------------------
    // Lifecycle
    // -------------------------------------------------------------------------
    onInit: function () {
      this._clockInterval   = null;
      this._rfidBuffer      = '';
      this._rfidTimer       = null;
      this._RFID_TIMEOUT_MS = 80;   // HID wedge leverer tegn meget hurtigt

      this._startClock();
      this._initRfidCapture();
      this._restoreLanguageToggle();
    },

    onExit: function () {
      clearInterval(this._clockInterval);
      document.removeEventListener('keypress', this._rfidKeyHandler);
    },

    // -------------------------------------------------------------------------
    // Ur
    // -------------------------------------------------------------------------
    _startClock: function () {
      const update = () => {
        const now = new Date();
        const pad  = n => String(n).padStart(2, '0');
        this.byId('clockDisplay').setText(
          `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
        );
      };
      update();
      this._clockInterval = setInterval(update, 1000);
    },

    // -------------------------------------------------------------------------
    // RFID keyboard-wedge capture
    // Keyboard wedge "taster" stregkode/RFID hurtigt og slutter med Enter.
    // Vi lytter på document for at garantere focus uanset hvad brugeren klikker.
    // -------------------------------------------------------------------------
    _initRfidCapture: function () {
      this._rfidKeyHandler = (e) => {
        // Ignorer hvis brugeren er ved at skrive i manuel input
        const manualInput = this.byId('manualInput')?.getFocusDomRef();
        if (document.activeElement === manualInput) return;

        if (e.key === 'Enter') {
          if (this._rfidBuffer.length >= 4) {
            this._doLogin({ token: this._rfidBuffer });
          }
          this._rfidBuffer = '';
          clearTimeout(this._rfidTimer);
          return;
        }

        // Kun printbare tegn
        if (e.key.length === 1) {
          this._rfidBuffer += e.key;
          clearTimeout(this._rfidTimer);
          this._rfidTimer = setTimeout(() => { this._rfidBuffer = ''; }, this._RFID_TIMEOUT_MS);
        }
      };
      document.addEventListener('keypress', this._rfidKeyHandler);
    },

    onRfidCapture: function (oEvent) {
      // Fallback: hvis det skjulte input modtager submit
      const token = oEvent.getSource().getValue().trim();
      if (token) this._doLogin({ token });
      oEvent.getSource().setValue('');
    },

    // -------------------------------------------------------------------------
    // Manuel login
    // -------------------------------------------------------------------------
    onManualInputChange: function () {
      this._hideError();
    },

    onManualLogin: function () {
      const input = this.byId('manualInput');
      const value = input.getValue().trim();
      if (!value) return;

      this._doLogin({ employeeID: value });
      input.setValue('');
    },

    // -------------------------------------------------------------------------
    // API-kald
    // -------------------------------------------------------------------------
    _doLogin: function ({ token, employeeID }) {
      this._hideError();
      const body = JSON.stringify({ token: token || null, employeeID: employeeID || null });

      this.getOwnerComponent().getCsrfToken().then(csrfToken =>
        fetch(API_BASE, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
          body,
        })
          .then(res => res.json().then(data => ({ ok: res.ok, data })))
          .then(({ ok, data }) => {
            if (!ok) throw new Error(data.error?.message || data.message || 'Login fejlede');
            this._onLoginSuccess(data.value ?? data);
          })
      ).catch(err => this._showError(err.message));
    },

    _onLoginSuccess: function (data) {
      // Gem session i JSON-model
      const sessionModel = this.getOwnerComponent().getModel('session');
      sessionModel.setData({
        sessionId:  data.sessionId,
        employeeID: data.employeeID,
        fullName:   data.fullName,
        costCenter: data.costCenter,
        entryId:    null,
        entryType:  null,
        startTime:  null,
        running:    false,
      });

      this.getOwnerComponent().getRouter().navTo('TimeEntry');
    },

    // -------------------------------------------------------------------------
    // Sprogskift
    // -------------------------------------------------------------------------
    _restoreLanguageToggle: function () {
      const saved = localStorage.getItem('kiosk_language') || 'da';
      const btn   = this.byId('langToggle');
      if (btn) {
        btn.getItems().forEach(item => {
          if (item.getKey() === saved) btn.setSelectedItem(item);
        });
      }
    },

    onLanguageChange: function (oEvent) {
      const lang = oEvent.getParameter('item').getKey();
      localStorage.setItem('kiosk_language', lang);
      Localization.setLanguage(lang);
      // Reload for at i18n-bundlet genindlæses korrekt
      window.location.reload();
    },

    // -------------------------------------------------------------------------
    // Fejlvisning
    // -------------------------------------------------------------------------
    _showError: function (msg) {
      const strip = this.byId('errorStrip');
      strip.setText(msg);
      strip.setVisible(true);
    },

    _hideError: function () {
      this.byId('errorStrip')?.setVisible(false);
    }

  });
});
