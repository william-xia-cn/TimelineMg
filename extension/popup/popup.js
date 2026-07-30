(() => {
    const currentScript = document.currentScript;
    const script = document.createElement('script');
    script.src = '../sidebar/sidebar.js';
    script.defer = false;
    if (currentScript?.parentNode) {
        currentScript.parentNode.insertBefore(script, currentScript.nextSibling);
    } else {
        document.head.appendChild(script);
    }
})();
