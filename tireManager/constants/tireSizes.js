const TIRE_SIZES = Object.freeze([
    "295/80R22.5",
    "315/80R22.5",
    "12R22.5",
    "11R22.5",
    "385/65R22.5"
]);

module.exports = {
    TIRE_SIZES,

    isValidSize(size) {
        return TIRE_SIZES.includes(size);
    }
};
