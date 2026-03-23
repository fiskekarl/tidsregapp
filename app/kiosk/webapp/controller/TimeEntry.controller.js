sap.ui.define([
  'sap/ui/core/mvc/Controller',
  'sap/ui/model/json/JSONModel',
  'sap/m/MessageBox',
  'sap/m/MessageToast'
], function (Controller, JSONModel, MessageBox, MessageToast) {
  'use strict';

  const AUTO_LOGOUT_SEC = 120;   // 2 minutter
  const API = {
    startEntry : '/api/time/startEntry',
    stopEntry  : '/api/time/stopEntry',
    logout     : '/api/time/logout',
    keepAlive  : '/api/time/keepAlive',
    entries    : '/api/time/TimeEntries',
  };

  return Controller.extend('com.timeregistration.kiosk.controller.TimeEntry', {

    // -------------------------------------------------------------------------
    // Lifecycle
    // -------------------------------------------------------------------------
    onInit: function () {
      this._remainingSec  = AUTO_LOGOUT_SEC;
      this._countdownTmr  = null;
      this._elapsedTmr    = null;
      this._lastKeepAlive = 0;
      this._activityBound = this._resetCountdown.bind(this);

      this.getOwnerComponent().getRouter()
        .getRoute('TimeEntry')
        .attachPatternMatched(this._onRouteMatched, this);
    },

    onExit: function () {
      this._stopTimers();
      document.removeEventListener('pointerdown', this._activityBound);
      document.removeEventListener('keypress',    this._activityBound);
    },

    _onRouteMatched: function () {
      // Initialisér entries-model hvis ikke allerede sat
      if (!this.byId('entryList').getModel('entries')) {
        this.byId('entryList').setModel(new JSONModel([]), 'entries');
      }
      this._startCountdown();
      this._loadTodaysEntries();

      // Sæt default type
      const btn = this.byId('entryTypeBtn');
      btn.getItems()[0].setPressed(true);
      btn.fireSelectionChange({ item: btn.getItems()[0] });

      // Lyt på brugeraktivitet
      document.addEventListener('pointerdown', this._activityBound);
      document.addEventListener('keypress',    this._activityBound);
    },

    // -------------------------------------------------------------------------
    // Registreringstype
    // -------------------------------------------------------------------------
    onEntryTypeChange: function (oEvent) {
      const key = oEvent.getParameter('item').getKey();
      this.byId('orderPanel').setVisible(key === 'ORDER');
      this.byId('costCenterPanel').setVisible(key === 'COSTCENTER');
      this._currentType = key;
    },

    // -------------------------------------------------------------------------
    // Start registrering
    // -------------------------------------------------------------------------
    onStartEntry: function () {
      const session = this._session();
      if (session.running) return;

      const type       = this._currentType || 'CLOCKINOUT';
      const orderNo    = this.byId('orderInput')?.getValue().trim();
      const costCtrNo  = this.byId('costCenterInput')?.getValue().trim();

      if (type === 'ORDER' && !orderNo) {
        return this._showError(this._t('errorOrderRequired'));
      }
      if (type === 'COSTCENTER' && !costCtrNo) {
        return this._showError(this._t('errorCostCenterRequired'));
      }

      this._post(API.startEntry, {
        sessionId:    session.sessionId,
        entryType:    type,
        orderNumber:  orderNo  || null,
        costCenterNo: costCtrNo || null,
      }).then(data => {
        const entryId = data.value ?? data;
        const now     = new Date().toLocaleTimeString();
        const sm      = this.getOwnerComponent().getModel('session');
        sm.setProperty('/entryId',   entryId);
        sm.setProperty('/entryType', type);
        sm.setProperty('/startTime', now);
        sm.setProperty('/running',   true);
        this._startElapsed();
        this._hideError();
        MessageToast.show(this._t('entryStarted'));
      }).catch(err => this._showError(err.message));
    },

    // -------------------------------------------------------------------------
    // Stop registrering
    // -------------------------------------------------------------------------
    onStopEntry: function () {
      const session = this._session();
      if (!session.running) return;

      this._post(API.stopEntry, { entryId: session.entryId })
        .then(data => {
          const result = data.value ?? data;
          const sm = this.getOwnerComponent().getModel('session');
          sm.setProperty('/running',   false);
          sm.setProperty('/entryId',   null);
          sm.setProperty('/startTime', null);
          this._stopElapsed();
          this._loadTodaysEntries();
          this._hideError();

          const s4msg = result.s4Status === 'SYNCED'
            ? this._t('syncedToS4')
            : `${this._t('s4Error')}: ${result.s4Message}`;
          MessageToast.show(`${this._t('entryStopped')} · ${result.durationMin} min · ${s4msg}`);
        }).catch(err => this._showError(err.message));
    },

    // -------------------------------------------------------------------------
    // Manuel logout
    // -------------------------------------------------------------------------
    onManualLogout: function () {
      MessageBox.confirm(this._t('confirmLogout'), {
        onClose: action => {
          if (action === MessageBox.Action.OK) this._doLogout('MANUAL');
        }
      });
    },

    _doLogout: function (reason) {
      const session = this._session();
      this._stopTimers();
      document.removeEventListener('pointerdown', this._activityBound);
      document.removeEventListener('keypress',    this._activityBound);

      const body = { sessionId: session.sessionId, reason };
      this.getOwnerComponent().getCsrfToken().then(token =>
        fetch(API.logout, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
          body:    JSON.stringify(body),
        })
      ).finally(() => {
        // Ryd session-model og naviger tilbage
        this.getOwnerComponent().getModel('session').setData({
          sessionId: null, employeeID: null, fullName: null,
          costCenter: null, entryId: null, entryType: null,
          startTime: null, running: false,
        });
        this.getOwnerComponent().getRouter().navTo('Idle');
      });
    },

    // -------------------------------------------------------------------------
    // Auto-logout countdown (2 min)
    // -------------------------------------------------------------------------
    _startCountdown: function () {
      this._remainingSec = AUTO_LOGOUT_SEC;
      this._updateCountdownUI();
      this._countdownTmr = setInterval(() => {
        this._remainingSec--;
        this._updateCountdownUI();
        if (this._remainingSec <= 0) {
          this._doLogout('TIMEOUT');
        }
      }, 1000);
    },

    _resetCountdown: function () {
      this._remainingSec = AUTO_LOGOUT_SEC;
      // Keepalive til server højst hvert 30. sekund
      const now = Date.now();
      if (now - this._lastKeepAlive < 30000) return;
      this._lastKeepAlive = now;
      const sid = this._session().sessionId;
      if (sid) this.getOwnerComponent().getCsrfToken().then(token =>
        fetch(API.keepAlive, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
          body:    JSON.stringify({ sessionId: sid }),
        })
      ).catch(() => {});
    },

    _updateCountdownUI: function () {
      const min = String(Math.floor(this._remainingSec / 60)).padStart(2, '0');
      const sec = String(this._remainingSec % 60).padStart(2, '0');
      const txt = this.byId('countdownText');
      if (txt) txt.setText(`⏱ ${min}:${sec}`);
    },

    // -------------------------------------------------------------------------
    // Elapsed timer (vises mens registrering kører)
    // -------------------------------------------------------------------------
    _startElapsed: function () {
      const start = Date.now();
      this._elapsedTmr = setInterval(() => {
        const diff = Math.floor((Date.now() - start) / 1000);
        const h = String(Math.floor(diff / 3600)).padStart(2, '0');
        const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
        const s = String(diff % 60).padStart(2, '0');
        const el = this.byId('elapsedTimer');
        if (el) el.setText(`${h}:${m}:${s}`);
      }, 1000);
    },

    _stopElapsed: function () {
      clearInterval(this._elapsedTmr);
      this._elapsedTmr = null;
      const el = this.byId('elapsedTimer');
      if (el) el.setText('00:00:00');
    },

    _stopTimers: function () {
      clearInterval(this._countdownTmr);
      this._stopElapsed();
    },

    // -------------------------------------------------------------------------
    // Hent dagens registreringer
    // -------------------------------------------------------------------------
    _loadTodaysEntries: function () {
      const session = this._session();
      if (!session.employeeID) return;

      const today      = new Date().toISOString().substring(0, 10);
      const empId      = encodeURIComponent(session.employeeID);
      const url        = `${API.entries}?$filter=Employee_EmployeeID eq '${empId}' and StartTime ge ${today}T00:00:00Z&$orderby=StartTime desc&$top=10`;

      fetch(url)
        .then(r => r.json())
        .then(data => {
          this.byId('entryList').getModel('entries').setData(data.value ?? []);
        })
        .catch(() => {});
    },

    // -------------------------------------------------------------------------
    // Hjælpere
    // -------------------------------------------------------------------------
    _post: function (url, body) {
      return this.getOwnerComponent().getCsrfToken().then(token =>
        fetch(url, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
          body:    JSON.stringify(body),
        }).then(res => res.json().then(d => {
          if (!res.ok) throw new Error(d.error?.message || d.message || 'Fejl');
          return d;
        }))
      );
    },

    _session: function () {
      return this.getOwnerComponent().getModel('session').getData();
    },

    _t: function (key) {
      return this.getOwnerComponent().getModel('i18n').getResourceBundle().getText(key);
    },

    _showError: function (msg) {
      const s = this.byId('errorStrip');
      s.setText(msg); s.setVisible(true);
    },

    _hideError: function () {
      this.byId('errorStrip')?.setVisible(false);
    },

  });
});
