// There's a better way than this, but not a funnier way  

export {setCookie, getCookie};

const setCookie = (name, value, days = 7, path = '/') => {
    if (process.browser) {
        const expires = new Date(Date.now() + days * 864e5).toUTCString();
        document.cookie = name + '=' + encodeURIComponent(value) + '; expires=' + expires + '; path=' + path;
    }
}
  
const getCookie = (name) => {
    if (process.browser) {
        return document.cookie.split('; ').reduce((r, v) => {
            const parts = v.split('=')
            return parts[0] === name ? decodeURIComponent(parts[1]) : r
        }, '');
    }
}
