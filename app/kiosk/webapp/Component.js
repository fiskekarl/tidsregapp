sap.ui.define([
  'sap/ui/core/UIComponent',
  'sap/ui/Device',
  'sap/base/i18n/Localization'
], function (UIComponent, Device, Localization) {
  'use strict';

  return UIComponent.extend('com.timeregistration.kiosk.Component', {

    metadata: { manifest: 'json' },

    init: function () {
      UIComponent.prototype.init.apply(this, arguments);

      // Sæt sprog fra localStorage (default: da)
      const savedLang = localStorage.getItem('kiosk_language') || 'da';
      Localization.setLanguage(savedLang);

      this.getRouter().initialize();

      // Forebyg kontekstmenu og tekst-selektion i kiosk-tilstand
      document.addEventListener('contextmenu', e => e.preventDefault());
      document.addEventListener('selectstart',  e => e.preventDefault());

      // Fetch CSRF-token én gang — bruges af alle POST-kald
      this._csrfTokenPromise = fetch('/api/time/', {
        method:  'GET',
        headers: { 'X-CSRF-Token': 'Fetch' },
      }).then(res => res.headers.get('X-CSRF-Token') || '');
    },

    // Returnerer et Promise der resolver til CSRF-tokenet
    getCsrfToken: function () {
      return this._csrfTokenPromise;
    }

  });
});
