const requestForm = document.querySelector("#request-form");
const itemRequest = document.querySelector("#item-request");
const requestStatus = document.querySelector("#request-status");
const formLoadedAt = Date.now();

requestForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const request = itemRequest.value.trim();
  const company = requestForm.querySelector("#company").value;
  const submitButton = requestForm.querySelector("button");

  if (!request) {
    requestStatus.textContent = "Type a request first.";
    return;
  }

  requestStatus.textContent = "Sending...";
  submitButton.disabled = true;

  try {
    const response = await fetch("/api/request-item", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        request,
        company,
        formLoadedAt
      })
    });

    if (!response.ok) {
      throw new Error("Request failed.");
    }

    itemRequest.value = "";
    requestStatus.textContent = "Request sent. Thank you.";
  } catch (error) {
    requestStatus.textContent = "Request failed. You can still message @HunterLanier on X.";
  } finally {
    submitButton.disabled = false;
  }
});
