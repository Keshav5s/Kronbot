
$(document).ready(function () {

    let history = [];
    let loading = false;

    let temperature = 0.7;
    let responseStyle = "balanced";

    const $input = $("#userInput");
    const $messages = $("#messages");
    const $welcome = $("#welcome");
    const $send = $("#sendBtn");
    const $chatArea = $("#chatArea");

    // Scroll to latest message
    function scrollBottom() {
        $chatArea.scrollTop(
            $chatArea[0].scrollHeight
        );
    }

    // Add message
    function addMessage(text, type) {

        const avatar = type === "user" ? "U" : "K";

        const html = `
            <div class="message ${type}">
                <div class="avatar">${avatar}</div>
                <div class="message-content"></div>
            </div>
        `;

        const $message = $(html);

        $message.find(".message-content").text(text);

        $messages.append($message);

        scrollBottom();

        return $message;
    }

    // Typing animation
    function showTyping() {

        const html = `
            <div class="message bot" id="typing">
                <div class="avatar">K</div>
                <div class="message-content">
                    <div class="typing">
                        <span></span>
                        <span></span>
                        <span></span>
                    </div>
                </div>
            </div>
        `;

        $messages.append(html);
        scrollBottom();
    }

    // Render AI response safely
    function renderResponse($message, text) {

        const $content = $message.find(".message-content");

        const html = marked.parse(text);

        const $rendered = $("<div>").html(html);

        // Remove unsafe HTML elements
        $rendered.find(
            "script, iframe, object, embed, form"
        ).remove();

        $rendered.find("*").each(function () {

            const element = this;

            $.each(element.attributes, function () {

                if (
                    this.name.startsWith("on") ||
                    ["href", "src", "xlink:href"].includes(
                        this.name.toLowerCase()
                    ) && /^\s*javascript:/i.test(this.value)
                ) {
                    element.removeAttribute(this.name);
                }

            });

        });

        $content.empty().append($rendered.contents());

        const $actions = $(`
            <div class="message-actions">
                <button class="copy-btn">
                    <i class="fa-regular fa-copy"></i> Copy response
                </button>
            </div>
        `);

        $content.append($actions);

        $actions.find(".copy-btn").on("click", async function () {

            try {
                await navigator.clipboard.writeText(text);

                $(this).html(
                    '<i class="fa-solid fa-check"></i> Copied'
                );

            } catch {
                $(this).text("Copy unavailable");
            }

        });

        scrollBottom();
    }

    // Animated text reveal
    function typeResponse($message, text) {

        const $content = $message.find(".message-content");

        const $typingText = $("<span></span>");

        $content.empty().append($typingText);

        let position = 0;

        function next() {

            position = Math.min(position + 5, text.length);

            $typingText.text(
                text.substring(0, position)
            );

            scrollBottom();

            if (position < text.length) {
                setTimeout(next, 12);
            } else {
                renderResponse($message, text);
            }

        }

        next();
    }

    // Send question
    async function sendMessage(prompt) {

        if (loading) return;

        const message = (
            prompt || $input.val()
        ).trim();

        if (!message) return;

        loading = true;
        $send.prop("disabled", true);

        $welcome.hide();

        addMessage(message, "user");

        $input.val("").css("height", "auto");

        showTyping();

        try {

            const response = await $.ajax({

                url: "/api/chat",

                method: "POST",

                contentType: "application/json",

                data: JSON.stringify({

                    message: message,

                    history: history,

                    temperature: temperature,

                    response_style: responseStyle

                })

            });

            $("#typing").remove();

            const reply = response.reply;

            if (!reply) {
                throw new Error("Empty AI response");
            }

            history.push({
                role: "user",
                content: message
            });

            history.push({
                role: "model",
                content: reply
            });

            const $message = addMessage("", "bot");

            typeResponse($message, reply);

        }

        catch (error) {

            $("#typing").remove();

            const errorText =
                error.responseJSON?.detail ||
                error.message ||
                "Something went wrong. Please try again.";

            addMessage(
                "Sorry! " + errorText,
                "bot"
            );

        }

        finally {

            loading = false;
            $send.prop("disabled", false);
            $input.trigger("focus");

        }

    }

    // Send button
    $send.on("click", function () {
        sendMessage();
    });

    // Enter to send, Shift + Enter for new line
    $input.on("keydown", function (e) {

        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }

    });

    // Auto resize textarea
    $input.on("input", function () {

        this.style.height = "auto";

        this.style.height =
            Math.min(this.scrollHeight, 160) + "px";

    });

    // Predefined questions
    $(".suggestion").on("click", function () {

        const prompt = $(this).data("prompt");

        sendMessage(prompt);

    });

    // New chat
    $("#newChat").on("click", function () {

        history = [];

        $messages.empty();

        $welcome.show();

        $("#sidebar").removeClass("open");

    });

    // Clear conversation
    $("#clearChat").on("click", function () {

        history = [];

        $messages.empty();

        $welcome.show();

    });

    // Sidebar
    $("#menuBtn").on("click", function () {

        $("#sidebar").toggleClass("open");

    });

    // Settings
    function openSettings() {
        $("#settingsModal").addClass("show");
    }

    $("#settingsBtn, #topSettings").on("click", function () {
        openSettings();
    });

    $("#closeSettings").on("click", function () {
        $("#settingsModal").removeClass("show");
    });

    $("#settingsModal").on("click", function (e) {

        if (e.target === this) {
            $(this).removeClass("show");
        }

    });

    // Temperature
    $("#temperature").on("input", function () {

        $("#temperatureValue").text(this.value);

    });

    // Save settings
    $("#saveSettings").on("click", function () {

        temperature = parseFloat(
            $("#temperature").val()
        );

        responseStyle = $("#responseStyle").val();

        localStorage.setItem(
            "kronbot_settings",
            JSON.stringify({
                temperature,
                responseStyle
            })
        );

        $("#settingsModal").removeClass("show");

    });

    // Load settings
    const saved = localStorage.getItem(
        "kronbot_settings"
    );

    if (saved) {

        try {

            const settings = JSON.parse(saved);

            if (
                Number.isFinite(settings.temperature) &&
                settings.temperature >= 0 &&
                settings.temperature <= 1
            ) {
                temperature = settings.temperature;
            }

            if (
                ["short", "balanced", "detailed"].includes(
                    settings.responseStyle
                )
            ) {
                responseStyle = settings.responseStyle;
            }

            $("#temperature").val(temperature);
            $("#temperatureValue").text(temperature);

            $("#responseStyle").val(responseStyle);

        } catch (e) {
            console.log("Settings could not be loaded.");
        }

    }

});
