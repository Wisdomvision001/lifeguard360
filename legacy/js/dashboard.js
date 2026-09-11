/* ========================================================================== 
   Lifeguard360 — dashboard.js
   Dashboard-only interactions. Location is requested only after user action.
   ========================================================================== */

(function initDashboard() {
  const requestButton = document.querySelector("#requestLocationButton");
  const locationBadge = document.querySelector("#locationBadge");
  const locationAddress = document.querySelector("#locationAddress");
  const locationAccuracy = document.querySelector("#locationAccuracy");
  const locationPreview = document.querySelector("#locationPreview");
  const topbarLocationDot = document.querySelector("#topbarLocationDot");
  const topbarLocationText = document.querySelector("#topbarLocationText");

  if (!requestButton || !locationBadge || !locationAddress || !locationAccuracy || !locationPreview)
    return;

  function setLocationState(label, badgeClass, address, accuracy, caption) {
    locationBadge.className = `badge ${badgeClass}`;
    locationBadge.innerHTML = `<span class="badge-dot"></span>${label}`;
    locationAddress.textContent = address;
    locationAccuracy.textContent = accuracy;
    locationPreview.setAttribute("aria-label", caption);
    locationPreview.querySelector(".map-placeholder__caption").textContent = caption;
    if (topbarLocationDot) topbarLocationDot.className = `topbar__location-dot ${badgeClass}`;
    if (topbarLocationText) topbarLocationText.textContent = `${label} location · ${accuracy}`;
  }

  function requestLocation() {
    if (!navigator.geolocation) {
      setLocationState(
        "Unavailable",
        "badge--red",
        "This browser does not support location",
        "Not available",
        "Hospital search cannot start without browser location support",
      );
      return;
    }

    requestButton.disabled = true;
    requestButton.setAttribute("aria-busy", "true");
    requestButton.textContent = "Requesting location...";

    setLocationState(
      "Requesting",
      "badge--blue",
      "Waiting for permission",
      "Not available",
      "Your browser is asking for location permission",
    );

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        const coordinateText = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;

        setLocationState(
          "Ready",
          "badge--green",
          `Coordinates available: ${coordinateText}`,
          `${Math.round(accuracy)} m accuracy`,
          "Location captured and ready for nearby hospital search",
        );
        requestButton.disabled = false;
        requestButton.removeAttribute("aria-busy");
        requestButton.textContent = "Refresh My Location";
      },
      (error) => {
        const message =
          error.code === error.PERMISSION_DENIED
            ? "Location permission was denied"
            : "Location could not be determined";

        setLocationState(
          "Not shared",
          "badge--amber",
          message,
          "Not available",
          "Grant location permission to prepare hospital search",
        );
        requestButton.disabled = false;
        requestButton.removeAttribute("aria-busy");
        requestButton.textContent = "Try Location Again";
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }

  requestButton.addEventListener("click", requestLocation);
})();
