/**
 * Sistema de doação PIX - Ajude Theo
 * Integração com a API ProPix (via funções serverless, credenciais protegidas).
 */
(function () {
  "use strict";

  var API_CREATE = "/api/public/pix/create";
  var API_STATUS = "/api/public/pix/status";
  var BUMP_AMOUNT = 10;
  var MIN_AMOUNT = 15;
  var POLL_INTERVAL = 3000;

  function brl(value) {
    return "R$ " + Number(value).toFixed(2).replace(".", ",");
  }

  function parseAmount(text) {
    if (typeof text === "number") return text;
    var clean = String(text || "").replace(/[^\d,.]/g, "");
    if (clean.indexOf(",") > -1) {
      clean = clean.replace(/\./g, "").replace(",", ".");
    } else if ((clean.match(/\./g) || []).length >= 1 && /\.\d{3}$/.test(clean)) {
      clean = clean.replace(/\./g, "");
    }
    var n = parseFloat(clean);
    return isNaN(n) ? 0 : n;
  }

  function el(id) {
    return document.getElementById(id);
  }

  function PixDonationSystem() {
    this.baseAmount = 0;
    this.bump = false;
    this.transactionId = null;
    this.pollTimer = null;
    this.paid = false;
    this.step = "confirm";
    this.bind();
  }

  PixDonationSystem.prototype.bind = function () {
    var self = this;

    // Botões de valor pré-definido
    document.addEventListener("click", function (event) {
      var target = event.target.closest("[data-pix-amount]");
      if (!target) return;
      event.preventDefault();
      self.openConfirm(parseAmount(target.getAttribute("data-pix-amount")));
    });

    // Valor personalizado
    var input = el("pixd-custom-amount");
    var customBtn = el("pixd-custom-btn");
    if (input) {
      input.addEventListener("input", function () {
        var digits = input.value.replace(/\D/g, "").slice(0, 9);
        input.value = digits ? (Number(digits) / 100).toFixed(2).replace(".", ",") : "";
        self.setCustomError("");
      });
      input.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
          event.preventDefault();
          self.submitCustom();
        }
      });
    }
    if (customBtn) {
      customBtn.addEventListener("click", function () {
        self.submitCustom();
      });
    }

    var bumpCheck = el("pixd-bump-check");
    if (bumpCheck) {
      bumpCheck.addEventListener("change", function () {
        self.bump = bumpCheck.checked;
        self.renderTotals();
      });
    }

    var confirmBtn = el("pixd-confirm-btn");
    if (confirmBtn) {
      confirmBtn.addEventListener("click", function () {
        self.createPix();
      });
    }

    var retryBtn = el("pixd-retry-btn");
    if (retryBtn) {
      retryBtn.addEventListener("click", function () {
        self.createPix();
      });
    }

    var copyBtn = el("copy-pix-code");
    if (copyBtn) {
      copyBtn.addEventListener("click", function () {
        self.copyPixCode();
      });
    }

    var code = el("pix-code");
    if (code) {
      code.addEventListener("click", function () {
        self.copyPixCode();
      });
    }

    var backBtn = el("pixd-back-btn");
    if (backBtn) {
      backBtn.addEventListener("click", function () {
        self.backToDonate();
      });
    }

    var leaveBtn = el("pixd-leave-btn");
    if (leaveBtn) {
      leaveBtn.addEventListener("click", function () {
        self.hidePixModal();
      });
    }

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") self.requestClose();
    });
  };

  PixDonationSystem.prototype.setCustomError = function (message) {
    var error = el("pixd-custom-error");
    if (error) {
      error.textContent = message || "";
      error.style.display = message ? "block" : "none";
    }
  };

  PixDonationSystem.prototype.submitCustom = function () {
    var input = el("pixd-custom-amount");
    if (!input) return;
    var value = parseAmount(input.value);
    if (!value || value < MIN_AMOUNT) {
      this.setCustomError("O valor mínimo para doação é R$ 15,00.");
      return;
    }
    this.setCustomError("");
    this.openConfirm(value);
  };

  PixDonationSystem.prototype.total = function () {
    return this.baseAmount + (this.bump ? BUMP_AMOUNT : 0);
  };

  PixDonationSystem.prototype.renderTotals = function () {
    var amount = el("pix-amount");
    var total = el("pixd-total");
    if (amount) amount.textContent = brl(this.baseAmount);
    if (total) total.textContent = brl(this.total());
  };

  PixDonationSystem.prototype.showStep = function (step) {
    this.step = step;
    ["confirm", "pix", "done", "error", "exit"].forEach(function (name) {
      var node = el("pixd-step-" + name);
      if (node) node.style.display = name === step ? "block" : "none";
    });
  };

  PixDonationSystem.prototype.openConfirm = function (amount) {
    this.stopPolling();
    this.baseAmount = amount;
    this.bump = false;
    this.transactionId = null;
    var bumpCheck = el("pixd-bump-check");
    if (bumpCheck) bumpCheck.checked = false;
    this.renderTotals();
    this.showStep("confirm");
    var modal = el("pix-modal");
    if (modal) modal.style.display = "flex";
    document.body.classList.add("pixd-modal-open");
  };

  /** Antes de fechar, mostra a tela de retenção pedindo para voltar a doar. */
  PixDonationSystem.prototype.requestClose = function () {
    if (this.paid || this.step === "done") {
      this.hidePixModal();
      return;
    }
    if (this.step === "exit") {
      this.hidePixModal();
      return;
    }
    this.stopPolling();
    this.setLoading(false);
    var amount = el("pixd-exit-amount");
    if (amount) amount.textContent = brl(this.total() || MIN_AMOUNT);
    this.showStep("exit");
    var modal = el("pix-modal");
    if (modal) {
      modal.style.display = "flex";
      modal.scrollTop = 0;
    }
    var content = modal ? modal.querySelector(".pixd-modal") : null;
    if (content && content.scrollIntoView) content.scrollIntoView({ block: "start" });
    document.body.classList.add("pixd-modal-open");
  };

  /** Volta para o início da doação (etapa de confirmação do valor). */
  PixDonationSystem.prototype.backToDonate = function () {
    this.openConfirm(this.baseAmount || MIN_AMOUNT);
  };

  PixDonationSystem.prototype.hidePixModal = function () {
    this.stopPolling();
    var modal = el("pix-modal");
    if (modal) modal.style.display = "none";
    var loading = el("pix-loading-modal");
    if (loading) loading.style.display = "none";
    document.body.classList.remove("pixd-modal-open");
  };

  PixDonationSystem.prototype.setLoading = function (isLoading, text, subtext) {
    var loading = el("pix-loading-modal");
    if (loading) loading.style.display = isLoading ? "flex" : "none";
    var txt = el("pix-loading-text");
    if (txt) txt.textContent = text || "Gerando... aguarde";
    var sub = el("pix-loading-subtext");
    if (sub) sub.textContent = subtext || "Preparando seu QR Code e código Pix";
  };

  PixDonationSystem.prototype.showError = function (message) {
    var msg = el("pixd-error-msg");
    if (msg) msg.textContent = message;
    this.showStep("error");
  };

  PixDonationSystem.prototype.createPix = function () {
    var self = this;
    var amount = this.total();
    if (!amount || amount < MIN_AMOUNT) {
      this.showError("O valor mínimo para doação é R$ 15,00.");
      return;
    }

    this.setLoading(true, "Gerando... aguarde", "Preparando seu QR Code e código Pix");

    var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timeout = setTimeout(function () {
      if (controller) controller.abort();
    }, 20000);

    fetch(API_CREATE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: amount,
        description:
          "Doação para o tratamento do Theo" +
          (self.bump ? " + ajuda com medicamentos" : ""),
      }),
      signal: controller ? controller.signal : undefined,
    })
      .then(function (response) {
        return response.json().then(function (data) {
          if (!response.ok || data.error) {
            throw new Error(data.error || "Não conseguimos gerar o Pix agora.");
          }
          return data;
        });
      })
      .then(function (data) {
        clearTimeout(timeout);
        self.setLoading(false);
        self.transactionId = data.transactionId || null;
        self.renderPix(data, amount);
        self.startPolling();
      })
      .catch(function (error) {
        clearTimeout(timeout);
        self.setLoading(false);
        var message =
          error && error.name === "AbortError"
            ? "A conexão demorou demais. Toque em tentar novamente."
            : (error && error.message) || "Não conseguimos gerar o Pix agora.";
        self.showError(message);
      });
  };

  PixDonationSystem.prototype.renderPix = function (data, amount) {
    var code = el("pix-code");
    if (code) code.value = data.copyPaste || "";

    var pixAmount = el("pixd-pix-amount");
    if (pixAmount) pixAmount.textContent = brl(amount);

    var qr = el("pixd-qr");
    if (qr) {
      qr.innerHTML = "";
      var placeholder = document.createElement("div");
      placeholder.id = "pixd-qr-loading";
      placeholder.style.cssText =
        "display:flex;flex-direction:column;align-items:center;justify-content:center;width:230px;height:230px;border:1px solid #ececec;border-radius:12px;background:#fafafa;color:#555;font-size:14px;";
      placeholder.innerHTML =
        '<div style="width:36px;height:36px;border:4px solid #f3f3f3;border-top:4px solid #24ca68;border-radius:50%;animation:spin 1s linear infinite;margin-bottom:10px;"></div>' +
        "Carregando QR Code...";
      qr.appendChild(placeholder);

      var img = document.createElement("img");
      img.alt = "QR Code Pix da doação";
      img.style.display = "none";
      img.onload = function () {
        var loader = el("pixd-qr-loading");
        if (loader) loader.style.display = "none";
        img.style.display = "block";
      };
      img.onerror = function () {
        img.onerror = function () {
          var loader = el("pixd-qr-loading");
          if (loader) loader.innerHTML = "Não foi possível carregar o QR Code. Use o Pix copia e cola.";
        };
        img.src =
          "https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=0&data=" +
          encodeURIComponent(data.copyPaste || "");
      };
      img.src =
        data.qrcodeUrl ||
        "https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=0&data=" +
          encodeURIComponent(data.copyPaste || "");
      qr.appendChild(img);
    }

    if (data.receiverName) {
      var receiver = el("pixd-receiver-name");
      if (receiver) receiver.textContent = data.receiverName;
    }

    this.setStatus("Aguardando pagamento...", false);
    this.showStep("pix");
  };

  PixDonationSystem.prototype.setStatus = function (text, paid) {
    var status = el("pixd-status");
    var statusText = el("pixd-status-text");
    if (statusText) statusText.textContent = text;
    if (status) status.classList.toggle("pixd-status-paid", !!paid);
  };

  PixDonationSystem.prototype.startPolling = function () {
    var self = this;
    this.stopPolling();
    if (!this.transactionId) return;
    this.pollTimer = setInterval(function () {
      self.checkStatus();
    }, POLL_INTERVAL);
  };

  PixDonationSystem.prototype.stopPolling = function () {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  };

  PixDonationSystem.prototype.checkStatus = function () {
    var self = this;
    if (!this.transactionId) return;
    fetch(API_STATUS, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionId: this.transactionId }),
    })
      .then(function (response) {
        return response.json();
      })
      .then(function (data) {
        var state = String(data.transactionState || data.status || "").toUpperCase();
        if (state === "COMPLETO" || state === "COMPLETED" || state === "PAID") {
          self.stopPolling();
          self.onPaid();
        }
      })
      .catch(function () {
        /* mantém o polling em caso de falha momentânea */
      });
  };

  PixDonationSystem.prototype.onPaid = function () {
    this.setStatus("Pagamento confirmado!", true);
    this.showStep("done");
    this.paid = true;
  };

  PixDonationSystem.prototype.copyPixCode = function () {
    var code = el("pix-code");
    var button = el("copy-pix-code");
    if (!code || !code.value) return;

    var done = function () {
      if (!button) return;
      var original = button.textContent;
      button.textContent = "Código copiado!";
      setTimeout(function () {
        button.textContent = original;
      }, 2000);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code.value).then(done, function () {
        code.select();
        document.execCommand("copy");
        done();
      });
    } else {
      code.select();
      document.execCommand("copy");
      done();
    }
  };

  window.PixDonationSystem = PixDonationSystem;
  var start = function () {
    window.pixDonationSystem = new PixDonationSystem();
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

  window.addEventListener("click", function (event) {
    var modal = el("pix-modal");
    if (event.target === modal && window.pixDonationSystem) {
      window.pixDonationSystem.requestClose();
    }
  });
})();
