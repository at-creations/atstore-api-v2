FROM redis:7-alpine

# Copy our redis.conf template
COPY redis.conf.template /redis.conf.template

# Create Redis config directory
RUN mkdir -p /usr/local/etc/redis

# Create a startup script to replace environment variables
RUN echo '#!/bin/sh' > /entrypoint.sh && \
    echo 'sed -e "s/\${REDIS_PASSWORD}/$REDIS_PASSWORD/g" -e "s/\${REDIS_PORT}/$REDIS_PORT/g" /redis.conf.template > /usr/local/etc/redis/redis.conf' >> /entrypoint.sh && \
    echo 'exec "$@"' >> /entrypoint.sh && \
    chmod +x /entrypoint.sh

# Set the entrypoint to our script
ENTRYPOINT ["/entrypoint.sh"]

# Default command
CMD ["redis-server", "/usr/local/etc/redis/redis.conf"]