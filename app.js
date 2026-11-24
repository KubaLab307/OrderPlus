
/* =================================
   JK RESTAURANT
   Customer website functionality
================================= */

// SUPABASE CONNECTION
// We will fill these in when we set up Supabase.

const SUPABASE_URL = "YOUR_SUPABASE_PROJECT_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";

let database = null;
let menuItems = [];
let cart = [];

// ELEMENTS

const menuContainer = document.getElementById("menu-container");
const cartContainer = document.getElementById("cart-items");
const cartCount = document.getElementById("cart-count");
const cartTotal = document.getElementById("cart-total");
const placeOrderButton = document.getElementById("place-order");

// HELPERS

function formatPrice(price) {
    return "£" + Number(price).toFixed(2);
}

function showMessage(element, message) {
    if (element) {
        element.textContent = message;
    }
}

// CONNECT TO SUPABASE

async function connectDatabase() {

    if (
        SUPABASE_URL === "YOUR_SUPABASE_PROJECT_URL" ||
        SUPABASE_ANON_KEY === "YOUR_SUPABASE_ANON_KEY"
    ) {
        showMessage(
            menuContainer,
            "The online menu will appear here once Supabase is connected."
        );

        showMessage(
            document.getElementById("waiting-time-message"),
            "The waiting-time service is not connected yet."
        );

        return false;
    }

    try {
        const { createClient } = await import(
            "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm"
        );

        database = createClient(
            SUPABASE_URL,
            SUPABASE_ANON_KEY
        );

        return true;

    } catch (error) {
        console.error("Database connection failed:", error);

        showMessage(
            menuContainer,
            "Unable to connect to the restaurant menu."
        );

        return false;
    }
}

// LOAD MENU

async function loadMenu() {

    if (!database || !menuContainer) return;

    menuContainer.textContent = "Loading menu...";

    const { data, error } = await database
        .from("menu_items")
        .select("*")
        .eq("is_available", true)
        .order("category")
        .order("name");

    if (error) {
        console.error(error);
        menuContainer.textContent = "Unable to load the menu.";
        return;
    }

    menuItems = data || [];

    renderMenu();
}

function renderMenu() {

    if (!menuContainer) return;

    menuContainer.replaceChildren();

    if (menuItems.length === 0) {
        showMessage(menuContainer, "No menu items are available.");
        return;
    }

    const categories = [...new Set(
        menuItems.map(item => item.category || "Other")
    )];

    categories.forEach(category => {

        const section = document.createElement("section");
        section.className = "menu-category";

        const heading = document.createElement("h3");
        heading.textContent = category;

        section.appendChild(heading);

        const grid = document.createElement("div");
        grid.className = "menu-grid";

        menuItems
            .filter(item => (item.category || "Other") === category)
            .forEach(item => {

                const card = document.createElement("article");
                card.className = "menu-item-card";

                const name = document.createElement("h4");
                name.textContent = item.name;

                const description = document.createElement("p");
                description.textContent = item.description || "";

                const price = document.createElement("strong");
                price.textContent = formatPrice(item.price);

                const button = document.createElement("button");
                button.type = "button";
                button.className = "primary-button";
                button.textContent = "Add to order";

                button.addEventListener("click", () => {
                    addToCart(item.id);
                });

                card.append(
                    name,
                    description,
                    price,
                    button
                );

                grid.appendChild(card);
            });

        section.appendChild(grid);
        menuContainer.appendChild(section);
    });
}

// SHOPPING BASKET

function addToCart(itemId) {

    const item = menuItems.find(
        menuItem => menuItem.id === itemId
    );

    if (!item) return;

    const existingItem = cart.find(
        cartItem => cartItem.id === itemId
    );

    if (existingItem) {
        existingItem.quantity++;
    } else {
        cart.push({
            id: item.id,
            name: item.name,
            price: Number(item.price),
            quantity: 1
        });
    }

    renderCart();
}

function changeQuantity(itemId, change) {

    const item = cart.find(
        cartItem => cartItem.id === itemId
    );

    if (!item) return;

    item.quantity += change;

    if (item.quantity <= 0) {
        cart = cart.filter(
            cartItem => cartItem.id !== itemId
        );
    }

    renderCart();
}

function renderCart() {

    if (!cartContainer) return;

    cartContainer.replaceChildren();

    const totalItems = cart.reduce(
        (total, item) => total + item.quantity,
        0
    );

    const totalPrice = cart.reduce(
        (total, item) =>
            total + item.price * item.quantity,
        0
    );

    showMessage(
        cartCount,
        `${totalItems} ${totalItems === 1 ? "item" : "items"}`
    );

    showMessage(cartTotal, formatPrice(totalPrice));

    if (cart.length === 0) {

        const emptyMessage = document.createElement("p");
        emptyMessage.className = "empty-cart";
        emptyMessage.textContent = "Your order is currently empty.";

        cartContainer.appendChild(emptyMessage);

        if (placeOrderButton) {
            placeOrderButton.disabled = true;
        }

        return;
    }

    cart.forEach(item => {

        const row = document.createElement("div");
        row.className = "cart-item";

        const details = document.createElement("div");

        const name = document.createElement("strong");
        name.textContent = item.name;

        const price = document.createElement("p");
        price.textContent = formatPrice(item.price * item.quantity);

        details.append(name, price);

        const controls = document.createElement("div");
        controls.className = "quantity-controls";

        const minus = document.createElement("button");
        minus.type = "button";
        minus.textContent = "−";
        minus.setAttribute("aria-label", "Remove one");

        minus.addEventListener("click", () => {
            changeQuantity(item.id, -1);
        });

        const quantity = document.createElement("span");
        quantity.textContent = item.quantity;

        const plus = document.createElement("button");
        plus.type = "button";
        plus.textContent = "+";
        plus.setAttribute("aria-label", "Add one");

        plus.addEventListener("click", () => {
            changeQuantity(item.id, 1);
        });

        controls.append(minus, quantity, plus);

        row.append(details, controls);
        cartContainer.appendChild(row);
    });

    if (placeOrderButton) {
        placeOrderButton.disabled = false;
    }
}

// PLACE ORDER

async function placeOrder() {

    if (!database || cart.length === 0) return;

    const customerSelect = document.getElementById("customer-name");

    const customerName = customerSelect
        ? customerSelect.value
        : "Customer";

    const total = cart.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0
    );

    placeOrderButton.disabled = true;
    placeOrderButton.textContent = "Submitting...";

    const order = {
        customer_name: customerName,
        items: cart.map(item => ({
            id: item.id,
            name: item.name,
            price: item.price,
            quantity: item.quantity
        })),
        total: Number(total.toFixed(2)),
        status: "new"
    };

    const { error } = await database
        .from("orders")
        .insert(order);

    if (error) {

        console.error(error);

        alert("Your order could not be submitted. Please try again.");

        placeOrderButton.disabled = false;
        placeOrderButton.textContent = "Place order";

        return;
    }

    alert("Your order has been submitted!");

    cart = [];
    renderCart();

    placeOrderButton.textContent = "Place order";
}

// MEAL WAITING TIME

async function loadWaitingTime() {

    if (!database) return;

    const waitingTime = document.getElementById("waiting-time");

    if (!waitingTime) return;

    const message = document.getElementById("waiting-time-message");
    const restaurantStatus = document.getElementById("timer-restaurant-status");
    const lastUpdated = document.getElementById("timer-last-updated");

    const { data, error } = await database
        .from("restaurant_settings")
        .select("*")
        .eq("id", 1)
        .maybeSingle();

    if (error || !data) {

        waitingTime.textContent = "--";
        showMessage(message, "Waiting-time information is unavailable.");

        return;
    }

    waitingTime.textContent = data.waiting_time ?? "--";

    showMessage(
        message,
        data.is_open
            ? "This is our current estimated preparation time."
            : "The restaurant is currently closed."
    );

    showMessage(
        restaurantStatus,
        data.is_open ? "Open" : "Closed"
    );

    if (lastUpdated) {
        lastUpdated.textContent = data.updated_at
            ? new Date(data.updated_at).toLocaleString()
            : "Not available";
    }
}

// START THE CUSTOMER WEBSITE

async function startWebsite() {

    const connected = await connectDatabase();

    if (!connected) return;

    if (menuContainer) {
        await loadMenu();
    }

    if (placeOrderButton) {
        placeOrderButton.addEventListener("click", placeOrder);
    }

    renderCart();

    if (document.getElementById("waiting-time")) {
        await loadWaitingTime();

        // Refresh the estimate every 30 seconds.
        setInterval(loadWaitingTime, 30000);
    }
}

startWebsite();
