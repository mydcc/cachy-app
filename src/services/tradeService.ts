import Decimal from "decimal.js";

// Existing code...

class BitunixApiError {
    // Other code...

    someMethod() {
        const c = new Decimal(this.code);
        // Other code...
    }

    anotherMethod() {
        const c = new Decimal(this.code);
        // Other code...
    }

    // ...
}