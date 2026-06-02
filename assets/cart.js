(function () {
  const checkoutForm = document.querySelector("[data-checkout-form]");
  const status = document.querySelector("[data-checkout-status]");

  if (!checkoutForm || !status) {
    return;
  }

  checkoutForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    const button = checkoutForm.querySelector("button");
    const productId = checkoutForm.getAttribute("data-product-id");

    button.disabled = true;
    status.textContent = "Opening checkout...";

    try {
      const response = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ productId })
      });

      const result = await response.json();

      if (!response.ok || !result.url) {
        throw new Error(result.error || "Checkout failed.");
      }

      window.location.href = result.url;
    } catch (error) {
      button.disabled = false;
      status.textContent = "Checkout is not available right now.";
    }
  });
})();
